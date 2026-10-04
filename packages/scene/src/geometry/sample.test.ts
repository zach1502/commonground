import { describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { elevationAt, heightmapBounds } from './sample.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const ramp = heightmapFrom({ width: 5, height: 4, resolutionM: 2 }, (x, z) => x + 10 * z);

describe('heightmapFrom', () => {
  it('fills rows in row-major order', () => {
    expect(ramp.elevations).toHaveLength(20);
    expect(ramp.elevations[6]).toBe(2 + 20);
  });
});

describe('elevationAt', () => {
  it('returns grid values at grid points', () => {
    expect(elevationAt(ramp, { x: 4, z: 2 })).toBeCloseTo(24);
  });

  it('interpolates between grid points', () => {
    expect(elevationAt(ramp, { x: 3, z: 1 })).toBeCloseTo(13);
  });

  it('clamps points outside the grid to the nearest edge', () => {
    expect(elevationAt(ramp, { x: -5, z: -5 })).toBeCloseTo(0);
    expect(elevationAt(ramp, { x: 100, z: 100 })).toBeCloseTo(8 + 60);
  });
});

describe('heightmapBounds', () => {
  it('spans the grid and its elevation range', () => {
    expect(heightmapBounds(ramp)).toEqual({
      minX: 0,
      maxX: 8,
      minZ: 0,
      maxZ: 6,
      minY: 0,
      maxY: 68,
    });
  });
});

describe('a core heightmap with its origin away from zero', () => {
  // Cell (i, j) sits at originLocal + (i + 0.5, j + 0.5) * resolutionM; elevation = x.
  const core = makeRampHeightmap({ width: 4, height: 3, gradeX: 1, originLocal: { x: 10, y: 20 } });

  it('samples at the cell centres core measured', () => {
    expect(elevationAt(core, { x: 10.5, z: 20.5 })).toBeCloseTo(10.5);
    expect(elevationAt(core, { x: 12, z: 21 })).toBeCloseTo(12);
  });

  it('spans the cell centres, with core y as scene z', () => {
    expect(heightmapBounds(core)).toMatchObject({ minX: 10.5, maxX: 13.5, minZ: 20.5, maxZ: 22.5 });
  });
});
