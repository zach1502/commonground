import { describe, expect, it } from 'vitest';

import { polygonArea, triangleCorners } from './measure.js';
import { heightmapFrom } from './synthetic-heightmap.js';
import { buildWaterDisc, waterNormalTexels, waterOffsets } from './water.js';

// A bowl whose lowest grid point is at (12, 10).
const bowl = heightmapFrom(
  { width: 30, height: 30, resolutionM: 1 },
  (x, z) => 5 + 0.05 * ((x - 12) ** 2 + (z - 10) ** 2),
);
const pond = [
  { x: 5, z: 5 },
  { x: 20, z: 5 },
  { x: 20, z: 20 },
  { x: 5, z: 20 },
];

describe('buildWaterDisc', () => {
  const disc = buildWaterDisc(bowl, pond, { segments: 24, levelAboveMinM: 0.3 });

  it('centres the disc on the lowest ground inside the outline', () => {
    expect(disc.centre.x).toBe(12);
    expect(disc.centre.y).toBeCloseTo(5.3);
    expect(disc.centre.z).toBe(10);
  });

  it('sizes the disc to the nearest edge of the outline', () => {
    expect(disc.radiusM).toBeCloseTo(5);
  });

  it('is a flat fan with one centre vertex and one rim vertex per segment', () => {
    expect(disc.mesh.positions).toHaveLength((24 + 1) * 3);
    expect(disc.mesh.indices).toHaveLength(24 * 3);
    for (let index = 0; index < 25; index += 1) {
      expect(disc.mesh.positions[index * 3 + 1]).toBeCloseTo(5.3);
      expect(disc.mesh.normals[index * 3 + 1]).toBe(1);
    }
  });

  it('winds the fan to face up', () => {
    expect(polygonArea(triangleCorners(disc.mesh, 0))).toBeGreaterThan(0);
  });

  it('falls back to the outline centre when no grid point is inside', () => {
    const sliver = [
      { x: 3.2, z: 3.2 },
      { x: 3.8, z: 3.2 },
      { x: 3.8, z: 3.8 },
      { x: 3.2, z: 3.8 },
    ];
    const small = buildWaterDisc(bowl, sliver, { segments: 8 });
    expect(small.centre.x).toBeCloseTo(3.5);
    expect(small.centre.z).toBeCloseTo(3.5);
    expect(small.radiusM).toBeCloseTo(0.3);
  });
});

describe('waterOffsets', () => {
  it('scrolls the two normal maps at 0.02 and 0.013 UV per second in opposite directions', () => {
    const [first = { x: 0, y: 0 }, second = { x: 0, y: 0 }] = waterOffsets(10, 'animated');
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(0.2);
    expect(Math.hypot(second.x, second.y)).toBeCloseTo(0.13);
    expect(first.x * second.x + first.y * second.y).toBeLessThan(0);
  });

  it('stays at 0 with reduced motion or on the phone tier', () => {
    waterOffsets(10, 'still').forEach((offset) => {
      expect(offset).toEqual({ x: 0, y: 0 });
    });
  });
});

describe('waterNormalTexels', () => {
  it('writes unit normals that point up and tile across the edges', () => {
    const size = 32;
    const texels = waterNormalTexels(size);
    expect(texels).toHaveLength(size * size * 4);
    const at = (i: number, j: number) => [
      ...texels.slice((j * size + i) * 4, (j * size + i) * 4 + 3),
    ];
    const [x, y, z] = at(5, 7).map((v) => v / 127.5 - 1);
    expect(Math.hypot(x ?? 0, y ?? 0, z ?? 0)).toBeCloseTo(1, 1);
    expect(z).toBeGreaterThan(0.8);
    // Column 0 continues from the last column, so the map repeats without a seam.
    expect(Math.abs((at(0, 3)[0] ?? 0) - (at(size - 1, 3)[0] ?? 0))).toBeLessThan(40);
  });
});
