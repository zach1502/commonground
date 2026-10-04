import { describe, expect, it } from 'vitest';

import { polygonSchema } from '../schema/geometry.js';

import {
  BOX_GROUND_MIN_SHARE,
  fillsItsBox,
  isOnGround,
  withGroundOutline,
} from './ground-outline.js';
import { makeFlatHeightmap } from './heightmap.js';

const box = makeFlatHeightmap({ width: 100, height: 60 });
const triangle = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 0, y: 60 },
];
// The recorded Jonathan Rogers Park outline in its 176 by 86 m grid.
const jonathanRogers = polygonSchema.parse([
  { x: 0.2804529449417464, y: 85.48059347584964 },
  { x: 175.20861999327903, y: 80.53539075748942 },
  { x: 173.02712226473213, y: 0 },
  { x: 0, y: 4.74887392353963 },
]);

describe('withGroundOutline', () => {
  it('keeps the outline of a triangle that leaves half its grid box empty', () => {
    expect(withGroundOutline(box, triangle).groundOutline).toEqual(triangle);
  });

  it('draws Jonathan Rogers Park as its whole grid box, as before', () => {
    const grid = makeFlatHeightmap({ width: 176, height: 86 });
    const ground = withGroundOutline(grid, jonathanRogers);
    expect(ground.groundOutline).toBeUndefined();
    expect(ground.elevations).toBe(grid.elevations);
  });

  it('treats an outline that covers the share limit as the box', () => {
    const strip = (widthM: number) => [
      { x: 0, y: 0 },
      { x: widthM, y: 0 },
      { x: widthM, y: 60 },
      { x: 0, y: 60 },
    ];
    expect(withGroundOutline(box, strip(BOX_GROUND_MIN_SHARE * 100)).groundOutline).toBeUndefined();
    expect(
      withGroundOutline(box, strip(BOX_GROUND_MIN_SHARE * 100 - 1)).groundOutline,
    ).toBeDefined();
  });
});

describe('isOnGround', () => {
  const ground = withGroundOutline(box, triangle);

  it('takes every point of a box parcel', () => {
    expect(isOnGround(box, { x: 90, y: 50 })).toBe(true);
  });

  it('refuses a point past the triangle and takes one inside it', () => {
    expect(isOnGround(ground, { x: 90, y: 50 })).toBe(false);
    expect(isOnGround(ground, { x: 10, y: 10 })).toBe(true);
  });
});

describe('fillsItsBox', () => {
  it('measures an outline against its own bounding box', () => {
    expect(fillsItsBox(jonathanRogers)).toBe(true);
    expect(fillsItsBox(triangle)).toBe(false);
  });
});
