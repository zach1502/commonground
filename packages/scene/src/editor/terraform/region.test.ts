import { describe, expect, it } from 'vitest';

import { gridOf, makeFlatHeightmap, type Grid } from '@parkshape/core';

import { patchRegion, unionRegion } from './region.js';

const grid: Grid = gridOf(makeFlatHeightmap({ width: 10, height: 10 }));

describe('patchRegion', () => {
  it('returns null for an empty patch', () => {
    expect(patchRegion({ cells: [] }, grid)).toBeNull();
  });

  it('grows the bounding box by one and clamps it to the grid', () => {
    const region = patchRegion({ cells: [{ x: 4, y: 5, deltaM: 1 }] }, grid);
    expect(region).toEqual({ minX: 3, minY: 4, maxX: 5, maxY: 6 });
  });

  it('never runs past the grid edges', () => {
    const region = patchRegion({ cells: [{ x: 0, y: 9, deltaM: 1 }] }, grid);
    expect(region).toEqual({ minX: 0, minY: 8, maxX: 1, maxY: 9 });
  });
});

describe('unionRegion', () => {
  it('covers both regions', () => {
    const a = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
    const b = { minX: 3, minY: 1, maxX: 5, maxY: 4 };
    expect(unionRegion(a, b)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 4 });
  });
});
