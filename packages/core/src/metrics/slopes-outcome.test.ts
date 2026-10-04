import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { computeMetrics } from './compute.js';
import {
  designOf,
  parametersWith,
  rectangle,
  rectangleParcel,
  type DesignParts,
  type PathInput,
} from './fixtures/design-builders.js';
import { makeRampHeightmap } from './heightmap.js';
import type { MetricsReport } from './report.js';

// A garden big enough for the required plots, so only slopes can warn.
const garden = {
  id: 'garden',
  catalogId: 'community-garden',
  polygon: rectangle(2, 2, 26, 11),
  locked: false,
};

function reportOn(gradeX: number, parts: DesignParts): MetricsReport {
  const result = computeMetrics({
    document: designOf({ areas: [garden], ...parts }),
    parcel: rectangleParcel(60, 40),
    parameters: parametersWith(),
    catalog: catalogIndex,
    heightmap: makeRampHeightmap({ width: 60, height: 40, gradeX }),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const eastward = (extra: Partial<PathInput> = {}): PathInput => ({
  id: 'walk',
  surface: 'asphalt',
  widthM: 2,
  points: [
    { x: 5, y: 25 },
    { x: 45, y: 25 },
  ],
  ...extra,
});

describe('slopes outcome on analytic ramps', () => {
  it('is ok for a path up a 4% ramp', () => {
    const report = reportOn(0.04, { areas: [], paths: [eastward()] });
    expect(report.constraints.slopes.status).toBe('ok');
    expect(report.details.pathSlopes[0]?.maxRunning).toBeCloseTo(0.04, 4);
  });

  it('warns for a path up a 6% ramp and states the measured grade', () => {
    const report = reportOn(0.06, { areas: [], paths: [eastward()] });
    expect(report.constraints.slopes.status).toBe('warn');
    expect(report.constraints.slopes.message).toBe(
      'Path 1 reaches 6% grade. Accessible paths are 5% or less.',
    );
  });
});

describe('existing elements in the slopes outcome', () => {
  it('reports an existing path apart and does not count it as a problem', () => {
    const report = reportOn(0.06, { areas: [], paths: [eastward({ existing: true })] });
    expect(report.constraints.slopes.status).toBe('ok');
    const [measured] = report.details.pathSlopes;
    expect(measured?.existing).toBe(true);
    expect(measured?.maxRunning).toBeCloseTo(0.06, 4);
    expect(measured?.runningSegments.length).toBeGreaterThan(0);
  });

  it('still counts a new path next to an existing one', () => {
    const report = reportOn(0.06, {
      areas: [],
      paths: [eastward({ existing: true }), eastward({ id: 'new-walk' })],
    });
    expect(report.constraints.slopes.value).toBe(1);
    expect(report.constraints.slopes.message).toContain('Path 2 reaches 6% grade');
    expect(report.details.pathSlopes[1]?.existing).toBe(false);
  });

  it('does not check the ground under an existing area', () => {
    const steepGarden = reportOn(0.08, { areas: [garden] });
    expect(steepGarden.constraints.slopes.message).toContain('Ground under Community garden');
    const existing = reportOn(0.08, { areas: [{ ...garden, existing: true }] });
    expect(existing.constraints.slopes.status).toBe('ok');
  });
});
