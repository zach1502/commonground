import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { measureCanopy } from './canopy.js';
import { designOf, itemAt, rectangle, type ItemInput } from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf, rasterizePolygon } from './raster.js';

const grid = gridOf(makeFlatHeightmap({ width: 100, height: 100 }));
const parcel = rasterizePolygon(grid, rectangle(0, 0, 100, 100));
const measure = (items: readonly ItemInput[]) =>
  measureCanopy({ document: designOf({ items }), catalog: catalogIndex, grid, parcel });

describe('measureCanopy', () => {
  it('gives pi r squared over the parcel for one 5 m crown', () => {
    // Red alder has a 5 m mature crown: pi * 25 / 10000 = 0.785 percent.
    expect(measure([itemAt('t1', 'red-alder', 50, 50)]).percent).toBeCloseTo(0.785, 1);
    expect(Math.abs(measure([itemAt('t1', 'red-alder', 50, 50)]).percent - 0.785)).toBeLessThan(
      0.05,
    );
  });

  it('counts two identical crowns once', () => {
    const one = measure([itemAt('t1', 'red-alder', 50, 50)]);
    const two = measure([itemAt('t1', 'red-alder', 50, 50), itemAt('t2', 'red-alder', 50, 50)]);
    expect(two).toEqual(one);
  });

  it('only counts crown inside the parcel', () => {
    const corner = measure([itemAt('t1', 'red-alder', 0, 0)]);
    expect(corner.percent).toBeCloseTo(0.785 / 4, 1);
  });

  it('ignores items that are not trees', () => {
    expect(measure([itemAt('b1', 'bench', 50, 50)]).percent).toBe(0);
  });

  it('reports the covered area in square metres', () => {
    expect(measure([itemAt('t1', 'red-alder', 50, 50)]).areaM2).toBeGreaterThan(70);
  });
});

describe('measureCanopy edge cases', () => {
  it('skips an item whose catalog id is unknown', () => {
    expect(measure([itemAt('x', 'not-in-catalog', 50, 50)])).toEqual({ percent: 0, areaM2: 0 });
  });

  it('reports crown area in square metres on a 2 m grid', () => {
    // 20 by 20 cells of 2 m. The 5 m crown covers the centres of 16 cells of 4 m2 each.
    const coarse = gridOf(makeFlatHeightmap({ width: 20, height: 20, resolutionM: 2 }));
    const coarseParcel = rasterizePolygon(coarse, rectangle(0, 0, 40, 40));
    const canopy = measureCanopy({
      document: designOf({ items: [itemAt('t1', 'red-alder', 20, 20)] }),
      catalog: catalogIndex,
      grid: coarse,
      parcel: coarseParcel,
    });
    expect(canopy.areaM2).toBe(64);
    // The area agrees with the percent of the 1600 m2 parcel.
    expect(canopy.areaM2).toBeCloseTo((canopy.percent / 100) * 1600, 9);
  });
});
