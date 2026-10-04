import { describe, expect, it } from 'vitest';

import { makeFlatHeightmap } from '@parkshape/core';

import type { MeshArrays } from '../types.js';

import { heightmapFrom } from './synthetic-heightmap.js';
import {
  buildTerrainMesh,
  ISLAND_SKIRT_DEPTH_M,
  skirtRingSize,
  surfaceIndexCount,
  writeGridRegion,
} from './terrain-mesh.js';

const hill = heightmapFrom(
  { width: 6, height: 4, resolutionM: 1 },
  (x, z) => 3 + 0.2 * x - 0.1 * z,
);
const SKIRT_DEPTH = 4;
const mesh = buildTerrainMesh(hill, { skirtDepthM: SKIRT_DEPTH });

function vertex(arrays: Float32Array, index: number): [number, number, number] {
  return [arrays[index * 3] ?? 0, arrays[index * 3 + 1] ?? 0, arrays[index * 3 + 2] ?? 0];
}

function faceNormal(arrays: MeshArrays, face: number): [number, number, number] {
  const [a, b, c] = [0, 1, 2].map((k) =>
    vertex(arrays.positions, arrays.indices[face * 3 + k] ?? 0),
  );
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error('missing vertex');
  }
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const [u0 = 0, u1 = 0, u2 = 0] = u;
  const [v0 = 0, v1 = 0, v2 = 0] = v;
  return [u1 * v2 - u2 * v1, u2 * v0 - u0 * v2, u0 * v1 - u1 * v0];
}

describe('skirtRingSize', () => {
  it('counts the vertices on the grid perimeter', () => {
    expect(skirtRingSize(hill)).toBe(2 * 6 + 2 * 4 - 4);
  });
});

describe('buildTerrainMesh', () => {
  const ring = skirtRingSize(hill);
  const gridVertices = 6 * 4;

  it('has one vertex per grid point plus a top and bottom skirt ring', () => {
    expect(mesh.positions).toHaveLength((gridVertices + 2 * ring) * 3);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
  });

  it('has two triangles per grid cell and two per skirt edge', () => {
    const cells = 5 * 3;
    expect(mesh.indices).toHaveLength((cells * 2 + ring * 2) * 3);
  });

  it('places grid vertices on the heightmap', () => {
    expect(vertex(mesh.positions, 1 * 6 + 2)).toEqual([2, expect.closeTo(3.3), 1]);
  });

  it('gives every vertex a unit normal', () => {
    for (let index = 0; index < mesh.normals.length / 3; index += 1) {
      expect(Math.hypot(...vertex(mesh.normals, index))).toBeCloseTo(1);
    }
  });

  it('drops the bottom skirt ring to the lowest elevation minus the skirt depth', () => {
    const lowest = Math.min(...hill.elevations);
    for (let index = gridVertices + ring; index < gridVertices + 2 * ring; index += 1) {
      expect(vertex(mesh.positions, index)[1]).toBeCloseTo(lowest - SKIRT_DEPTH);
    }
  });

  it('faces the top surface up and the skirt walls outward', () => {
    const centre = [2.5, 1.5];
    for (let face = 0; face < mesh.indices.length / 3; face += 1) {
      const [nx, ny, nz] = faceNormal(mesh, face);
      if (face < 5 * 3 * 2) {
        expect(ny).toBeGreaterThan(0);
      } else {
        const first = vertex(mesh.positions, mesh.indices[face * 3] ?? 0);
        const outward = (first[0] - (centre[0] ?? 0)) * nx + (first[2] - (centre[1] ?? 0)) * nz;
        expect(outward).toBeGreaterThan(0);
      }
    }
  });
});

describe('surfaceIndexCount', () => {
  it('counts the indices before the skirt starts', () => {
    expect(surfaceIndexCount(hill)).toBe(5 * 3 * 6);
  });
});

describe('buildTerrainMesh on a core heightmap', () => {
  it('puts each grid vertex on its cell centre', () => {
    const core = makeFlatHeightmap({
      width: 3,
      height: 2,
      elevationM: 7,
      resolutionM: 2,
      originLocal: { x: 100, y: 50 },
    });
    const arrays = buildTerrainMesh(core, { skirtDepthM: 1 });
    expect(vertex(arrays.positions, 0)).toEqual([101, 7, 51]);
    expect(vertex(arrays.positions, 5)).toEqual([105, 7, 53]);
  });
});

describe('writeGridRegion', () => {
  it('rewrites only the surface vertices inside the region to match a full rebuild', () => {
    const flat = makeFlatHeightmap({ width: 6, height: 6, elevationM: 1 });
    const before = buildTerrainMesh(flat, { skirtDepthM: SKIRT_DEPTH });
    const positions = Float32Array.from(before.positions);
    const normals = Float32Array.from(before.normals);
    const raised = makeFlatHeightmap({ width: 6, height: 6, elevationM: 1 });
    raised.elevations[2 * 6 + 2] = 4;
    writeGridRegion(raised, positions, normals, { minX: 1, minY: 1, maxX: 3, maxY: 3 });
    const full = buildTerrainMesh(raised, { skirtDepthM: SKIRT_DEPTH });
    expect(positions[(2 * 6 + 2) * 3 + 1]).toBeCloseTo(4, 6);
    expect(vertex(positions, 2 * 6 + 2)).toEqual(vertex(full.positions, 2 * 6 + 2));
    expect(positions[(5 * 6 + 5) * 3 + 1]).toBeCloseTo(1, 6);
  });
});

describe('ISLAND_SKIRT_DEPTH_M', () => {
  it('is the 1.5 m skirt DESIGN.md asks for', () => {
    expect(ISLAND_SKIRT_DEPTH_M).toBe(1.5);
  });
});
