import { describe, expect, it } from 'vitest';

import { meshGroundArea, polygonArea } from './measure.js';

describe('polygonArea', () => {
  it('is positive for outlines whose triangles face up', () => {
    const square = [
      { x: 0, z: 0 },
      { x: 0, z: 2 },
      { x: 3, z: 2 },
      { x: 3, z: 0 },
    ];
    expect(polygonArea(square)).toBe(6);
    expect(polygonArea([...square].reverse())).toBe(-6);
  });
});

describe('meshGroundArea', () => {
  it('sums triangle areas projected on the ground', () => {
    const mesh = {
      positions: new Float32Array([0, 5, 0, 4, 9, 0, 0, 1, 3]),
      normals: new Float32Array(9),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(meshGroundArea(mesh)).toBe(6);
  });
});
