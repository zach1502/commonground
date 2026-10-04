import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import type { ItemId } from '../schema/ids.js';

import { designOf, itemAt, rectangle, type GradeCellInput } from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf, rasterizePolygon } from './raster.js';
import { lockedTrees, measureTerraform, type TerraformInput } from './terraform.js';

const grid = gridOf(makeFlatHeightmap({ width: 20, height: 20 }));
const parcel = rasterizePolygon(grid, rectangle(0, 0, 20, 20));

function measure(cells: readonly GradeCellInput[], patch: Partial<TerraformInput> = {}) {
  return measureTerraform({
    grid,
    parcel,
    gradeDelta: designOf({ cells }).gradeDelta,
    lockedTrees: [],
    noGradeZones: [],
    maxDeviationM: 5,
    rootZonePerDbhCm: 0.12,
    ...patch,
  });
}

const row = (count: number, deltaM: number, y = 0) =>
  Array.from({ length: count }, (_, x) => ({ x, y, deltaM }));

describe('measureTerraform volumes', () => {
  it('conserves volume when a raise is matched by an equal lower', () => {
    const result = measure([...row(4, 0.5), ...row(4, -0.5, 5)]);
    expect(result.cut).toBe(2);
    expect(result.fill).toBe(2);
    expect(result.cut).toBe(result.fill);
    expect(result.net).toBe(0);
    expect(result.truckTrips).toBe(0);
  });

  it('rounds truck trips up to whole 10 m3 loads', () => {
    expect(measure(row(20, 0.5)).truckTrips).toBe(1);
    expect(measure(row(20, 0.525)).truckTrips).toBe(2);
    expect(measure(row(20, -0.525)).net).toBeCloseTo(-10.5, 9);
  });

  it('sums repeated cells before measuring', () => {
    const result = measure([
      { x: 1, y: 1, deltaM: 1 },
      { x: 1, y: 1, deltaM: -1 },
    ]);
    expect(result).toMatchObject({ cut: 0, fill: 0, disturbedPercent: 0 });
  });
});

describe('measureTerraform disturbance and limits', () => {
  it('gives the disturbed share of parcel cells', () => {
    // 10 changed cells out of 400 parcel cells; a zero delta does not count.
    expect(measure([...row(10, 0.2), { x: 0, y: 9, deltaM: 0 }]).disturbedPercent).toBe(2.5);
  });

  it('counts cells past the deviation limit', () => {
    const result = measure([...row(3, 1.5), { x: 0, y: 4, deltaM: -2 }], { maxDeviationM: 1 });
    expect(result.deviationCells).toBe(4);
    expect(result.largestDeviationM).toBe(2);
  });

  it('ignores cells off the grid', () => {
    expect(measure([{ x: 30, y: 30, deltaM: 5 }]).fill).toBe(0);
  });

  it('reports grading inside a no-grade zone', () => {
    const zones = designOf({
      zones: [{ id: 'z', kind: 'noGrade', polygon: rectangle(0, 0, 5, 5), label: 'Creek bank' }],
    }).zones;
    const result = measure(row(8, 0.2), { noGradeZones: zones });
    expect(result.noGradeHits).toEqual([{ zoneId: 'z', zoneLabel: 'Creek bank', cells: 5 }]);
  });
});

describe('measureTerraform root zones', () => {
  const alder = {
    id: 'alder' as ItemId,
    label: 'Red alder',
    position: { x: 10, y: 10 },
    dbhCm: 40,
  };

  it('rejects grading within the root zone of a locked tree', () => {
    // Root zone radius is 0.12 m per cm: 40 cm gives 4.8 m. Cell (12, 10) is 2.5 m away.
    const result = measure([{ x: 12, y: 10, deltaM: -0.3 }], { lockedTrees: [alder] });
    expect(result.rootZoneHits).toEqual([
      { treeId: 'alder', label: 'Red alder', radiusM: 4.8, cells: 1 },
    ]);
  });

  it('passes grading outside the root zone', () => {
    const result = measure([{ x: 18, y: 10, deltaM: -0.3 }], { lockedTrees: [alder] });
    expect(result.rootZoneHits).toEqual([]);
  });
});

describe('lockedTrees', () => {
  it('takes locked trees with the measured or catalog trunk diameter', () => {
    const document = designOf({
      items: [
        { ...itemAt('t1', 'red-alder', 1, 1), locked: true },
        { ...itemAt('t2', 'red-alder', 2, 2), locked: true, dbhCm: 55 },
        itemAt('t3', 'red-alder', 3, 3),
        { ...itemAt('b1', 'bench', 4, 4), locked: true },
      ],
    });
    expect(lockedTrees(document, catalogIndex)).toEqual([
      { id: 't1', label: 'Red alder', position: { x: 1, y: 1 }, dbhCm: 40 },
      { id: 't2', label: 'Red alder', position: { x: 2, y: 2 }, dbhCm: 55 },
    ]);
  });
});
