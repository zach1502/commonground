import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { SLOPE_TOLERANCE } from '../constants.js';
import { itemIdSchema } from '../schema/ids.js';

import { designOf, itemAt, parametersWith, rectangle } from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import { slopesOutcome, terraformOutcome } from './placement-constraints.js';
import { gridOf, rasterizePolygon } from './raster.js';
import { lockedTrees, measureTerraform, type TerraformMeasure } from './terraform.js';

const grid = gridOf(makeFlatHeightmap({ width: 10, height: 10 }));
const parcel = rasterizePolygon(grid, rectangle(0, 0, 10, 10));

function measureCells(cells: readonly { x: number; y: number; deltaM: number }[]) {
  return measureTerraform({
    grid,
    parcel,
    gradeDelta: designOf({ cells }).gradeDelta,
    lockedTrees: [],
    noGradeZones: [],
    maxDeviationM: 0.5,
    rootZonePerDbhCm: 0.12,
  });
}

describe('measureTerraform edges', () => {
  it('drops a grade cell one column past the east edge instead of wrapping it', () => {
    const result = measureCells([{ x: 10, y: 0, deltaM: 1 }]);
    expect(result.fill).toBe(0);
    expect(result.disturbedPercent).toBe(0);
  });

  it('counts a change of exactly the limit as within it, and 0.01 m more as a deviation', () => {
    expect(measureCells([{ x: 1, y: 1, deltaM: 0.5 }]).deviationCells).toBe(0);
    expect(measureCells([{ x: 1, y: 1, deltaM: 0.51 }]).deviationCells).toBe(1);
  });

  it('scales cut and fill by the area of a 2 m cell', () => {
    const wide = gridOf(makeFlatHeightmap({ width: 5, height: 5, resolutionM: 2 }));
    const result = measureTerraform({
      grid: wide,
      parcel: rasterizePolygon(wide, rectangle(0, 0, 10, 10)),
      gradeDelta: designOf({
        cells: [
          { x: 0, y: 0, deltaM: -0.5 },
          { x: 1, y: 0, deltaM: 0.25 },
        ],
      }).gradeDelta,
      lockedTrees: [],
      noGradeZones: [],
      maxDeviationM: 1,
      rootZonePerDbhCm: 0.12,
    });
    expect(result.cut).toBe(2);
    expect(result.fill).toBe(1);
  });

  it('reports 0 percent disturbed for an empty parcel', () => {
    const result = measureTerraform({
      grid,
      parcel: rasterizePolygon(grid, []),
      gradeDelta: designOf({ cells: [{ x: 1, y: 1, deltaM: 1 }] }).gradeDelta,
      lockedTrees: [],
      noGradeZones: [],
      maxDeviationM: 1,
      rootZonePerDbhCm: 0.12,
    });
    expect(result.disturbedPercent).toBe(0);
  });
});

describe('measureTerraform no-grade zones', () => {
  const zones = designOf({
    zones: [
      { id: 'easement', kind: 'forbidden', polygon: rectangle(0, 0, 4, 4), label: 'Easement' },
      { id: 'bank', kind: 'noGrade', polygon: rectangle(6, 6, 10, 10), label: 'Creek bank' },
    ],
  }).zones;

  function hitsFor(x: number, y: number) {
    return measureTerraform({
      grid,
      parcel,
      gradeDelta: designOf({ cells: [{ x, y, deltaM: 0.2 }] }).gradeDelta,
      lockedTrees: [],
      noGradeZones: zones,
      maxDeviationM: 1,
      rootZonePerDbhCm: 0.12,
    }).noGradeHits;
  }

  it('ignores grading inside a forbidden zone', () => {
    expect(hitsFor(1, 1)).toEqual([]);
  });

  it('reports no hit for a no-grade zone the grading misses', () => {
    expect(hitsFor(4, 5)).toEqual([]);
  });

  it('reports the cells graded inside a no-grade zone', () => {
    expect(hitsFor(7, 7)).toEqual([{ zoneId: 'bank', zoneLabel: 'Creek bank', cells: 1 }]);
  });
});

describe('lockedTrees filters', () => {
  it('skips a locked item the catalog does not know', () => {
    const document = designOf({
      items: [{ ...itemAt('mystery', 'mystery-tree', 5, 5), locked: true }],
    });
    expect(lockedTrees(document, catalogIndex)).toEqual([]);
  });

  it('skips a locked bench even when it has a trunk diameter', () => {
    const bench = { ...itemAt('old-bench', 'bench', 5, 5), locked: true, dbhCm: 30 };
    expect(lockedTrees(designOf({ items: [bench] }), catalogIndex)).toEqual([]);
  });
});

function terraformOf(patch: Partial<TerraformMeasure>): TerraformMeasure {
  return {
    cut: 0,
    fill: 0,
    net: 0,
    truckTrips: 0,
    disturbedPercent: 0,
    deviationCells: 0,
    largestDeviationM: 0,
    rootZoneHits: [],
    noGradeHits: [],
    ...patch,
  };
}

describe('terraformOutcome limits', () => {
  const limits = parametersWith({
    terraform: { maxDeviationM: 1, maxNetHaulM3: 20, maxDisturbedPercent: 10 },
  }).terraform;

  it('meets a net haul of exactly 20 m3 and fails 20.1 m3', () => {
    expect(terraformOutcome(terraformOf({ fill: 20, net: 20 }), limits).met).toBe(true);
    expect(terraformOutcome(terraformOf({ fill: 20.1, net: 20.1 }), limits).met).toBe(false);
  });

  it('meets 10 percent disturbed and fails 10.1 percent', () => {
    expect(terraformOutcome(terraformOf({ disturbedPercent: 10 }), limits).met).toBe(true);
    expect(terraformOutcome(terraformOf({ disturbedPercent: 10.1 }), limits).met).toBe(false);
  });
});

describe('slopesOutcome item grade boundary', () => {
  const limits = { maxRunning: 0.05, maxCross: 0.02 };
  const gradeOf = (grade: number) => ({
    id: itemIdSchema.parse('swings'),
    label: 'Swings',
    grade,
    limit: 0.05,
  });

  it('meets a grade of exactly 5 percent under a 5 percent item', () => {
    expect(slopesOutcome([], [gradeOf(0.05)], limits).met).toBe(true);
  });

  it('meets a grade at the limit plus the tolerance', () => {
    expect(slopesOutcome([], [gradeOf(0.05 + SLOPE_TOLERANCE)], limits).met).toBe(true);
  });

  it('fails a grade of 5.02 percent, past the 0.01 point tolerance', () => {
    expect(slopesOutcome([], [gradeOf(0.0502)], limits).met).toBe(false);
  });
});
