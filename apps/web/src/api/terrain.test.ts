import { describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { heightmapOf, terrainOf } from './terrain';

describe('terrainOf', () => {
  it('writes a grid the way the API sends it, so heightmapOf reads it back', () => {
    const grid = makeRampHeightmap({ width: 4, height: 3, gradeX: 0.25 });
    const back = heightmapOf(terrainOf(grid));
    expect(back).toMatchObject({ width: 4, height: 3, resolutionM: grid.resolutionM });
    expect(Array.from(back.elevations)).toEqual(Array.from(grid.elevations));
  });
});
