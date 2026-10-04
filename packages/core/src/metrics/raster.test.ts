import { describe, expect, it } from 'vitest';

import { rectangle } from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import {
  areaM2,
  cellCentre,
  countCells,
  coveragePercent,
  emptyMask,
  gridOf,
  intersectCount,
  maskIndexes,
  rasterizeCircle,
  rasterizeOrientedRect,
  rasterizePolygon,
  rasterizeRibbon,
  union,
  type Grid,
} from './raster.js';

const grid: Grid = { width: 20, height: 20, cellM: 1, originLocal: { x: 0, y: 0 } };

describe('grid helpers', () => {
  it('takes the grid from a heightmap', () => {
    const heightmap = makeFlatHeightmap({ width: 4, height: 3, originLocal: { x: 2, y: 1 } });
    expect(gridOf(heightmap)).toEqual({
      width: 4,
      height: 3,
      cellM: 1,
      originLocal: { x: 2, y: 1 },
    });
  });

  it('puts cell centres half a cell in from the corner', () => {
    expect(cellCentre(grid, 3, 4)).toEqual({ x: 3.5, y: 4.5 });
  });

  it('starts every mask empty', () => {
    expect(countCells(emptyMask(grid))).toBe(0);
  });
});

describe('rasterizePolygon', () => {
  it('fills whole cells of an aligned rectangle', () => {
    expect(countCells(rasterizePolygon(grid, rectangle(2, 3, 7, 5)))).toBe(10);
  });

  it('fills a right triangle by cell centre', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ] as const;
    // Row j keeps centres with x + y < 10, so 10 - j cells minus the diagonal: 9 + 8 + ... + 0 = 45.
    expect(countCells(rasterizePolygon(grid, [...triangle]))).toBe(45);
  });

  it('fills a concave polygon without its notch', () => {
    const notched = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ] as const;
    expect(countCells(rasterizePolygon(grid, [...notched]))).toBe(36 - 8);
  });

  it('clips to the grid', () => {
    expect(countCells(rasterizePolygon(grid, rectangle(-5, -5, 2, 2)))).toBe(4);
  });
});

describe('rasterizeCircle', () => {
  it('approximates pi r squared', () => {
    const big: Grid = { ...grid, width: 100, height: 100 };
    expect(areaM2(rasterizeCircle(big, { x: 50, y: 50 }, 20))).toBeGreaterThan(Math.PI * 400 - 20);
    expect(areaM2(rasterizeCircle(big, { x: 50, y: 50 }, 20))).toBeLessThan(Math.PI * 400 + 20);
  });

  it('keeps at least the cell under a tiny circle', () => {
    expect(countCells(rasterizeCircle(grid, { x: 3, y: 3 }, 0.1))).toBe(1);
  });

  it('marks nothing when the centre is off the grid', () => {
    expect(countCells(rasterizeCircle(grid, { x: -30, y: 3 }, 0.1))).toBe(0);
  });
});

describe('rasterizeOrientedRect', () => {
  it('fills an unrotated rectangle', () => {
    const rect = { centre: { x: 10, y: 10 }, widthM: 4, depthM: 2, rotationDeg: 0 };
    expect(countCells(rasterizeOrientedRect(grid, rect))).toBe(8);
  });

  it('swaps width and depth at 90 degrees', () => {
    const rect = { centre: { x: 10, y: 10 }, widthM: 6, depthM: 2, rotationDeg: 90 };
    const mask = rasterizeOrientedRect(grid, rect);
    expect(countCells(mask)).toBe(12);
    expect(intersectCount(mask, rasterizePolygon(grid, rectangle(9, 7, 11, 13)))).toBe(12);
  });

  it('keeps at least the cell under a small footprint', () => {
    const rect = { centre: { x: 3.6, y: 3.6 }, widthM: 0.3, depthM: 0.3, rotationDeg: 45 };
    expect(maskIndexes(rasterizeOrientedRect(grid, rect))).toEqual([3 * 20 + 3]);
  });
});

describe('rasterizeRibbon', () => {
  it('covers a straight path by its width', () => {
    const ribbon = rasterizeRibbon(
      grid,
      [
        { x: 2, y: 10 },
        { x: 12, y: 10 },
      ],
      2,
    );
    // Centres from x 2.5 to 11.5 in rows 9 and 10, plus the round caps at x 1.5 and 12.5.
    expect(countCells(ribbon)).toBe(24);
  });

  it('does not count a corner twice', () => {
    const bent = rasterizeRibbon(
      grid,
      [
        { x: 2, y: 2 },
        { x: 10, y: 2 },
        { x: 10, y: 10 },
      ],
      1,
    );
    const legs = union(grid, [
      rasterizeRibbon(
        grid,
        [
          { x: 2, y: 2 },
          { x: 10, y: 2 },
        ],
        1,
      ),
      rasterizeRibbon(
        grid,
        [
          { x: 10, y: 2 },
          { x: 10, y: 10 },
        ],
        1,
      ),
    ]);
    expect(countCells(bent)).toBe(countCells(legs));
  });
});

describe('mask algebra', () => {
  const left = rasterizePolygon(grid, rectangle(0, 0, 4, 4));
  const right = rasterizePolygon(grid, rectangle(2, 0, 6, 4));

  it('unions without double counting', () => {
    expect(countCells(union(grid, [left, right]))).toBe(24);
  });

  it('counts shared cells', () => {
    expect(intersectCount(left, right)).toBe(8);
  });

  it('scales area by the cell size', () => {
    const coarse: Grid = { ...grid, cellM: 2 };
    expect(areaM2(rasterizePolygon(coarse, rectangle(0, 0, 4, 4)))).toBe(16);
  });

  it('gives coverage as a percent of the whole', () => {
    expect(coveragePercent(left, union(grid, [left, right]))).toBeCloseTo((16 / 24) * 100, 9);
    expect(coveragePercent(left, emptyMask(grid))).toBe(0);
  });
});
