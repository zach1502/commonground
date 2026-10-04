import { describe, expect, it } from 'vitest';

import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import { computeMetrics } from '../metrics/compute.js';
import { parametersWith } from '../metrics/fixtures/design-builders.js';
import type { DesignArea, DesignDocument } from '../schema/design.js';

import { BASELINE, GARDEN_ID, baselineInput, neutralIntent } from './fixtures/baseline-site.js';
import type { Intent } from './intent.js';
import { solveLayout, type SolveInput } from './solve.js';

const RECORDED_PLOTS = 56;
// The baseline garden box fits 40 beds, so a minimum of 50 is met only by the recorded count.
const MIN_PLOTS = 50;

const recordedBaseline: DesignDocument = {
  ...BASELINE,
  areas: BASELINE.areas.map((area) =>
    area.id === GARDEN_ID ? { ...area, recordedPlots: RECORDED_PLOTS } : area,
  ),
};

const parameters = parametersWith({
  requiredFeatures: [{ category: 'garden', minCount: 1, minPlots: MIN_PLOTS }],
});

function inputFor(intent: Intent): SolveInput {
  return baselineInput(intent, { baseline: recordedBaseline, parameters });
}

function solved(input: SolveInput): DesignDocument {
  const result = solveLayout(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.document;
}

function gardenOf(document: DesignDocument): DesignArea {
  const garden = document.areas.find((area) => area.id === GARDEN_ID);
  if (garden === undefined) throw new Error('the garden is gone');
  return garden;
}

function plotsOf(input: SolveInput, document: DesignDocument): number {
  const { parcel, heightmap, catalog, baseline } = input;
  const report = computeMetrics({ document, baseline, parcel, heightmap, catalog, parameters });
  if (!report.ok) throw new Error(JSON.stringify(report.error));
  return report.value.totals.gardenPlots;
}

function fitted(area: DesignArea): number {
  const entry = catalogIndex.get(area.catalogId);
  if (entry?.geometryKind !== 'area') throw new Error('not an area');
  return modulePlotCount(entry, area.polygon);
}

describe('recorded garden plots through the solver', () => {
  it('carries the garden unchanged and keeps its recorded plots', () => {
    const before = gardenOf(recordedBaseline);
    expect(fitted(before)).toBeLessThan(MIN_PLOTS);
    const input = inputFor(neutralIntent());
    const document = solved(input);
    expect(gardenOf(document)).toEqual(before);
    expect(plotsOf(input, document)).toBe(RECORDED_PLOTS);
  });

  it('fits plots in a garden it enlarges', () => {
    const input = inputFor(
      neutralIntent({ features: [{ catalogId: 'community-garden', count: 1, size: 'large' }] }),
    );
    const document = solved(input);
    const after = gardenOf(document);
    expect(after.polygon).not.toEqual(gardenOf(recordedBaseline).polygon);
    expect(plotsOf(input, document)).toBe(fitted(after));
  });
});
