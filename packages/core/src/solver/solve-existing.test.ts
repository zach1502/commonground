import { describe, expect, it } from 'vitest';

import { computeMetrics } from '../metrics/compute.js';
import { makeRampHeightmap } from '../metrics/heightmap.js';
import type { DesignDocument } from '../schema/design.js';

import {
  GARDEN_ID,
  LAWN_ID,
  SITE_DEPTH_M,
  SITE_WIDTH_M,
  baselineInput,
  neutralIntent,
} from './fixtures/baseline-site.js';
import { solveLayout, type SolveInput } from './solve.js';

function solved(input: SolveInput): DesignDocument {
  const result = solveLayout(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.document;
}

describe('existing elements through the solver', () => {
  it('keeps the existing flag on the garden, lawn and path it carries unchanged', () => {
    const document = solved(baselineInput(neutralIntent()));
    const area = (id: string) => document.areas.find((candidate) => candidate.id === id);
    expect(area(GARDEN_ID)?.existing).toBe(true);
    expect(area(LAWN_ID)?.existing).toBe(true);
    expect(document.paths.find((path) => path.id === 'old-path')?.existing).toBe(true);
  });

  it('never marks a new path existing', () => {
    const document = solved(baselineInput(neutralIntent()));
    const added = document.paths.filter((path) => path.id !== 'old-path');
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((path) => path.existing === true)).toBe(false);
  });

  it('drops the flag from a garden it moves, so the new spot is checked', () => {
    const intent = neutralIntent({
      features: [{ catalogId: 'community-garden', count: 1, placement: { zone: 'south-west' } }],
      paths: { style: 'minimal' },
    });
    const garden = solved(baselineInput(intent)).areas.find((area) => area.id === GARDEN_ID);
    expect(garden).toBeDefined();
    expect(garden?.existing).toBeUndefined();
  });

  it('reports the existing path apart on steep ground and not as a slope problem', () => {
    const heightmap = makeRampHeightmap({
      width: SITE_WIDTH_M,
      height: SITE_DEPTH_M,
      gradeX: 0.08,
    });
    const input = baselineInput(neutralIntent({ paths: { style: 'minimal' } }), { heightmap });
    const document = solved(input);
    const kept = { ...document, paths: document.paths.filter((path) => path.id === 'old-path') };
    const report = computeMetrics({ ...input, document: kept });
    if (!report.ok) throw new Error('metrics failed');
    expect(report.value.details.pathSlopes[0]?.existing).toBe(true);
    expect(report.value.constraints.slopes.message).not.toContain('Path 1');
  });
});
