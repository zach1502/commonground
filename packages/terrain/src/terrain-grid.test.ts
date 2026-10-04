import { describe, expect, it } from 'vitest';

import { bilinearAt, cellCentres, gridCovering } from './terrain-grid.js';

describe('gridCovering', () => {
  it('rounds the extent up to whole cells from the minimum corner', () => {
    const grid = gridCovering(
      [
        { x: 0, y: 0 },
        { x: 10.2, y: 3 },
      ],
      2,
    );
    expect(grid).toEqual({ width: 6, height: 2, resolutionM: 2, originLocal: { x: 0, y: 0 } });
  });

  it('does not add a cell for float noise on an exact multiple', () => {
    const grid = gridCovering(
      [
        { x: 0, y: 0 },
        { x: 4.000_000_001, y: 1 },
      ],
      1,
    );
    expect(grid.width).toBe(4);
  });

  it('gives a degenerate extent one cell', () => {
    expect(gridCovering([{ x: 3, y: 4 }], 1)).toMatchObject({ width: 1, height: 1 });
  });
});

describe('cellCentres', () => {
  it('lists centres row by row from the south-west', () => {
    const centres = cellCentres({
      width: 2,
      height: 2,
      resolutionM: 2,
      originLocal: { x: 1, y: 0 },
    });
    expect(centres).toEqual([
      { x: 2, y: 1 },
      { x: 4, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 3 },
    ]);
  });
});

describe('bilinearAt', () => {
  // Rows run top to bottom, as rasters store them.
  const raster = { width: 2, height: 2, values: [10, 20, 30, 40] };

  it('returns pixel values at pixel centres', () => {
    expect(bilinearAt(raster, { col: 1, row: 1 })).toBe(40);
  });

  it('blends between four pixels', () => {
    expect(bilinearAt(raster, { col: 0.5, row: 0.5 })).toBe(25);
  });

  it('clamps to the nearest edge pixel outside the centres', () => {
    expect(bilinearAt(raster, { col: -0.4, row: 0 })).toBe(10);
  });

  it('returns undefined when a neighbour holds the no-data value', () => {
    expect(bilinearAt({ ...raster, noData: 30 }, { col: 0.5, row: 0.5 })).toBeUndefined();
  });

  it('returns undefined far outside the raster', () => {
    expect(bilinearAt(raster, { col: 5, row: 0 })).toBeUndefined();
  });
});
