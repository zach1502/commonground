import { describe, expect, it } from 'vitest';

import {
  maskIndexes,
  rasterizeCircle,
  rasterizeOrientedRect,
  rasterizePolygon,
  rasterizeRibbon,
  type Grid,
} from './raster.js';

const unitGrid = (width: number, height: number): Grid => ({
  width,
  height,
  cellM: 1,
  originLocal: { x: 0, y: 0 },
});

describe('raster bounds on a grid away from the origin', () => {
  it('finds the 5 cells within 1 m of a circle centre on a grid at (10, 20)', () => {
    const grid: Grid = { width: 5, height: 5, cellM: 1, originLocal: { x: 10, y: 20 } };
    const mask = rasterizeCircle(grid, { x: 12.5, y: 22.5 }, 1);
    expect(maskIndexes(mask)).toEqual([7, 11, 12, 13, 17]);
  });

  it('finds the same 5 cells on a grid at (-10, -20)', () => {
    const grid: Grid = { width: 5, height: 5, cellM: 1, originLocal: { x: -10, y: -20 } };
    const mask = rasterizeCircle(grid, { x: -7.5, y: -17.5 }, 1);
    expect(maskIndexes(mask)).toEqual([7, 11, 12, 13, 17]);
  });

  it('fills a 2 by 2 m square on a grid at (10, 20)', () => {
    const grid: Grid = { width: 4, height: 4, cellM: 1, originLocal: { x: 10, y: 20 } };
    const square = [
      { x: 10, y: 20 },
      { x: 12, y: 20 },
      { x: 12, y: 22 },
      { x: 10, y: 22 },
    ];
    expect(maskIndexes(rasterizePolygon(grid, square))).toEqual([0, 1, 4, 5]);
  });

  it('keeps the cell under a tiny circle on a grid at (10, 20)', () => {
    const grid: Grid = { width: 4, height: 4, cellM: 1, originLocal: { x: 10, y: 20 } };
    expect(maskIndexes(rasterizeCircle(grid, { x: 11.2, y: 22.1 }, 0.1))).toEqual([9]);
  });
});

describe('raster bounds with cells that are not 1 m', () => {
  it('finds the 5 cells within 0.5 m of a centre on a 0.5 m grid', () => {
    const grid: Grid = { width: 5, height: 5, cellM: 0.5, originLocal: { x: 0, y: 0 } };
    const mask = rasterizeCircle(grid, { x: 1.25, y: 1.25 }, 0.5);
    expect(maskIndexes(mask)).toEqual([7, 11, 12, 13, 17]);
  });

  it('keeps the cell under a tiny circle on a 2 m grid', () => {
    const grid: Grid = { width: 3, height: 3, cellM: 2, originLocal: { x: 0, y: 0 } };
    expect(maskIndexes(rasterizeCircle(grid, { x: 3.2, y: 1.1 }, 0.1))).toEqual([1]);
  });
});

describe('raster edges of the grid', () => {
  it('does not wrap a circle past the east edge into the next row', () => {
    const mask = rasterizeCircle(unitGrid(4, 4), { x: 3.5, y: 1.5 }, 1.2);
    expect(maskIndexes(mask)).toEqual([3, 6, 7, 11]);
  });

  it('keeps the cell under a tiny circle in the first column and row', () => {
    expect(maskIndexes(rasterizeCircle(unitGrid(4, 4), { x: 0.3, y: 0.3 }, 0.1))).toEqual([0]);
  });

  it('marks nothing for a tiny circle just past the east edge', () => {
    expect(maskIndexes(rasterizeCircle(unitGrid(4, 2), { x: 4.2, y: 0.5 }, 0.1))).toEqual([]);
  });
});

describe('rasterizeOrientedRect edges and rotation', () => {
  it('covers cell centres exactly half the width from the centre', () => {
    const rect = { centre: { x: 1.5, y: 0.5 }, widthM: 2, depthM: 1, rotationDeg: 0 };
    expect(maskIndexes(rasterizeOrientedRect(unitGrid(4, 1), rect))).toEqual([0, 1, 2]);
  });

  it('covers cell centres exactly half the depth from the centre', () => {
    const rect = { centre: { x: 0.5, y: 1.5 }, widthM: 0.5, depthM: 2, rotationDeg: 0 };
    expect(maskIndexes(rasterizeOrientedRect(unitGrid(3, 4), rect))).toEqual([0, 3, 6]);
  });

  it('covers only the middle cell with a short rectangle at 45 degrees', () => {
    const rect = { centre: { x: 1.5, y: 1.5 }, widthM: 1.6, depthM: 1.2, rotationDeg: 45 };
    expect(maskIndexes(rasterizeOrientedRect(unitGrid(3, 3), rect))).toEqual([4]);
  });

  it('covers the rising diagonal with a long rectangle at 45 degrees', () => {
    const rect = { centre: { x: 1.5, y: 1.5 }, widthM: 3.2, depthM: 0.2, rotationDeg: 45 };
    expect(maskIndexes(rasterizeOrientedRect(unitGrid(3, 3), rect))).toEqual([0, 4, 8]);
  });

  it('adds no cell under the centre when the rectangle already covers other cells', () => {
    const rect = { centre: { x: 1, y: 1 }, widthM: 2, depthM: 0.1, rotationDeg: -45 };
    expect(maskIndexes(rasterizeOrientedRect(unitGrid(3, 3), rect))).toEqual([1, 3]);
  });
});

describe('rasterizeRibbon shapes', () => {
  it('draws a round dot for a path whose two points are the same', () => {
    const dot = [
      { x: 1.5, y: 1.5 },
      { x: 1.5, y: 1.5 },
    ];
    expect(maskIndexes(rasterizeRibbon(unitGrid(3, 3), dot, 1.2))).toEqual([4]);
  });

  it('covers only the diagonal cells under a thin diagonal path', () => {
    const diagonal = [
      { x: 0.5, y: 0.5 },
      { x: 2.5, y: 2.5 },
    ];
    expect(maskIndexes(rasterizeRibbon(unitGrid(3, 3), diagonal, 0.2))).toEqual([0, 4, 8]);
  });
});

describe('rasterizePolygon scanlines', () => {
  it('fills a square whose corners sit on cell centres as a half-open span', () => {
    const square = [
      { x: 0.5, y: 0.5 },
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 2.5 },
      { x: 0.5, y: 2.5 },
    ];
    expect(maskIndexes(rasterizePolygon(unitGrid(3, 3), square))).toEqual([0, 1, 3, 4]);
  });

  it('fills a sloping triangle that starts 1 m north of the grid edge', () => {
    const triangle = [
      { x: 0, y: 1 },
      { x: 4, y: 1 },
      { x: 0, y: 5 },
    ];
    expect(maskIndexes(rasterizePolygon(unitGrid(4, 6), triangle))).toEqual([4, 5, 6, 8, 9, 12]);
  });
});
