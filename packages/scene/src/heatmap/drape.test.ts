import { describe, expect, it } from 'vitest';

import { withGroundOutline } from '@parkshape/core';

import { buildGroundMesh } from '../geometry/ground-mesh.js';
import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import { buildDrapeArrays } from './drape.js';

describe('buildDrapeArrays', () => {
  const heightmap = heightmapFrom({ width: 3, height: 2, resolutionM: 2 }, () => 10);
  const grid = { width: 6, height: 4, cellM: 1, originLocal: { x: 0, y: 0 } };
  const arrays = buildDrapeArrays(heightmap, grid, { liftM: 0.05 });

  it('puts one vertex over each heightmap node, lifted above the ground', () => {
    expect(arrays.positions).toHaveLength(3 * 2 * 3);
    expect(Array.from(arrays.positions.slice(0, 3))).toEqual([0, 10.05, 0].map(Math.fround));
  });

  it('maps each node to its place on the heat grid texture', () => {
    // Node (2, 1) sits at local (4, 2): two thirds across and half way up the 6 by 4 m grid.
    expect(arrays.uvs[0]).toBe(0);
    expect(arrays.uvs[1]).toBe(0);
    const last = arrays.uvs.length - 2;
    expect(arrays.uvs[last]).toBeCloseTo(4 / 6);
    expect(arrays.uvs[last + 1]).toBeCloseTo(2 / 4);
  });

  it('covers the surface with two triangles per quad and no skirt', () => {
    expect(arrays.indices).toHaveLength(2 * 1 * 6);
  });
});

describe('buildDrapeArrays on a triangular parcel', () => {
  const terrain = heightmapFrom({ width: 11, height: 11, resolutionM: 1 }, () => 10);
  const frame = { width: 10, height: 10, cellM: 1, originLocal: { x: 0, y: 0 } };
  const outlined = withGroundOutline(terrain, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ]);
  const drape = buildDrapeArrays(outlined, frame, { liftM: 0.05 });

  it('drapes the heat only over the ground inside the triangle', () => {
    expect(drape.indices.length).toBe(
      buildGroundMesh(outlined, { skirtDepthM: 1 }).surfaceIndexCount,
    );
    drape.indices.forEach((vertex) => {
      const x = drape.positions[vertex * 3] ?? 0;
      const z = drape.positions[vertex * 3 + 2] ?? 0;
      expect(x + z).toBeLessThanOrEqual(10 + 1e-4);
    });
  });

  it('keeps the texture coordinates on the heat grid', () => {
    expect(drape.uvs.length / 2).toBe(drape.positions.length / 3);
  });
});
