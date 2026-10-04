import { describe, expect, it } from 'vitest';

import { shapeArrays } from './geometry.js';

function extent(positions: Float32Array, axis: number): [number, number] {
  const values = [...positions].filter((_, index) => index % 3 === axis);
  return [Math.min(...values), Math.max(...values)];
}

describe('shapeArrays', () => {
  it('builds a box that fills its size with its base on y = 0', () => {
    const box = shapeArrays({ shape: 'box', widthM: 2, depthM: 4, heightM: 1 });
    expect(extent(box.positions, 0)).toEqual([-1, 1]);
    expect(extent(box.positions, 1)).toEqual([0, 1]);
    expect(extent(box.positions, 2)).toEqual([-2, 2]);
    expect(box.indices.length / 3).toBe(12);
  });

  it('builds a closed cylinder inside its size', () => {
    const cylinder = shapeArrays({ shape: 'cylinder', widthM: 2, depthM: 2, heightM: 3 });
    const [minX, maxX] = extent(cylinder.positions, 0);
    expect(minX).toBeCloseTo(-1);
    expect(maxX).toBeCloseTo(1);
    expect(extent(cylinder.positions, 1)).toEqual([0, 3]);
    expect(cylinder.normals).toHaveLength(cylinder.positions.length);
  });

  it('builds a sphere that touches its top and bottom', () => {
    const sphere = shapeArrays({ shape: 'sphere', widthM: 2, depthM: 2, heightM: 2 });
    const [minY, maxY] = extent(sphere.positions, 1);
    expect(minY).toBeCloseTo(0);
    expect(maxY).toBeCloseTo(2);
    expect(Math.max(...sphere.indices)).toBeLessThan(sphere.positions.length / 3);
  });
});
