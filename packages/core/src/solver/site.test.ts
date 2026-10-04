import { describe, expect, it } from 'vitest';

import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeRampHeightmap } from '../metrics/heightmap.js';
import { emptyMask } from '../metrics/raster.js';

import { buildSite, cellAt, distanceField, indexOf, pointOf } from './site.js';

describe('buildSite', () => {
  it('marks parcel cells and samples slope at each cell centre', () => {
    const heightmap = makeRampHeightmap({ width: 6, height: 4, gradeX: 0.1 });
    const site = buildSite(rectangleParcel(4, 4), heightmap);
    expect(site.parcel.cells[indexOf(site.grid, 3, 0)]).toBe(1);
    expect(site.parcel.cells[indexOf(site.grid, 4, 0)]).toBe(0);
    // Interior cells see the full ramp; edge cells hold the edge value on one side.
    expect(site.slope[indexOf(site.grid, 2, 2)]).toBeCloseTo(0.1);
    expect(site.slope[indexOf(site.grid, 0, 2)]).toBeCloseTo(0.05);
    expect(site.parcelCells).toBe(16);
  });

  it('converts between points and cells', () => {
    const site = buildSite(rectangleParcel(4, 4), makeRampHeightmap({ width: 4, height: 4 }));
    expect(cellAt(site.grid, { x: 2.7, y: 1.2 })).toBe(indexOf(site.grid, 2, 1));
    expect(cellAt(site.grid, { x: -0.1, y: 1 })).toBeUndefined();
    expect(pointOf(site.grid, indexOf(site.grid, 1, 3))).toEqual({ x: 1.5, y: 3.5 });
  });
});

describe('distanceField', () => {
  it('is 0 on the mask, 1 cell beside it and about 1.41 on the diagonal', () => {
    const grid = { width: 3, height: 3, cellM: 2, originLocal: { x: 0, y: 0 } };
    const mask = emptyMask(grid);
    mask.cells[indexOf(grid, 0, 0)] = 1;
    const field = distanceField(mask);
    expect(field[indexOf(grid, 0, 0)]).toBe(0);
    expect(field[indexOf(grid, 1, 0)]).toBe(2);
    expect(field[indexOf(grid, 1, 1)]).toBeCloseTo(2 * Math.SQRT2);
    expect(field[indexOf(grid, 2, 2)]).toBeCloseTo(4 * Math.SQRT2);
  });

  it('is infinite everywhere when the mask is empty', () => {
    const grid = { width: 2, height: 1, cellM: 1, originLocal: { x: 0, y: 0 } };
    expect([...distanceField(emptyMask(grid))]).toEqual([Infinity, Infinity]);
  });
});
