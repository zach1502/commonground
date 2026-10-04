import { describe, expect, it } from 'vitest';

import { makeFlatHeightmap, withGroundOutline, type PlanePoint } from '@parkshape/core';

import type { MeshArrays } from '../types.js';

import { buildGroundMesh } from './ground-mesh.js';
import { meshGroundArea, polygonArea, triangleCorners } from './measure.js';
import { heightmapFrom } from './synthetic-heightmap.js';
import { buildTerrainMesh, type TerrainArrays } from './terrain-mesh.js';

const SKIRT_DEPTH = 2;
const EPSILON = 1e-4;
// 41 by 41 grid nodes, one every metre from 0 to 40 m.
const GRID = { width: 41, height: 41, resolutionM: 1 } as const;
const TRIANGLE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 0, y: 40 },
];
// A triangle whose long side crosses the cells between grid nodes.
const OFF_GRID_TRIANGLE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 0, y: 27.3 },
];
const L_SHAPE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 40 },
  { x: 0, y: 40 },
];
const HYPOTENUSE = 40;

const slope = heightmapFrom(GRID, (x, z) => 2 + 0.05 * x + 0.02 * z);
const meshOn = (outline: readonly PlanePoint[]) =>
  buildGroundMesh(withGroundOutline(slope, outline), { skirtDepthM: SKIRT_DEPTH });

function part(mesh: TerrainArrays, from: number, to: number): MeshArrays {
  return { ...mesh, indices: mesh.indices.slice(from, to) };
}
const surfaceOf = (mesh: TerrainArrays) => part(mesh, 0, mesh.surfaceIndexCount);
const skirtOf = (mesh: TerrainArrays) => part(mesh, mesh.surfaceIndexCount, mesh.indices.length);

type Vec = [number, number, number];

function vertexAt(mesh: MeshArrays, vertex: number): Vec {
  const at = (k: number) => mesh.positions[vertex * 3 + k] ?? 0;
  return [at(0), at(1), at(2)];
}

/** The x and z parts of the face normal, and the face centre on the ground. */
function faceOnGround(mesh: MeshArrays, face: number) {
  const [a, b, c] = [0, 1, 2].map((k) => vertexAt(mesh, mesh.indices[face * 3 + k] ?? 0));
  if (a === undefined || b === undefined || c === undefined) throw new Error('missing vertex');
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  return {
    normal: { x: u[1] * v[2] - u[2] * v[1], z: u[0] * v[1] - u[1] * v[0] },
    centre: { x: (a[0] + b[0] + c[0]) / 3, z: (a[2] + b[2] + c[2]) / 3 },
  };
}

function usedVertices(mesh: MeshArrays): Vec[] {
  return Array.from(new Set(mesh.indices), (vertex) => vertexAt(mesh, vertex));
}

describe('buildGroundMesh inside a triangle outline', () => {
  const surface = surfaceOf(meshOn(TRIANGLE));
  const faces = surface.indices.length / 3;

  it('covers the triangle and nothing else', () => {
    expect(meshGroundArea(surface)).toBeCloseTo(800, 6);
  });

  it('draws half the triangles of the box grid', () => {
    expect(faces).toBe((40 * 40 * 2) / 2);
  });

  it('keeps every surface vertex inside or on the long side', () => {
    usedVertices(surface).forEach(([x, , z]) => {
      expect(x + z).toBeLessThanOrEqual(HYPOTENUSE + EPSILON);
    });
  });

  it('runs the surface edge along the long side rather than in steps', () => {
    const onEdge = usedVertices(surface).filter(
      ([x, , z]) => Math.abs(x + z - HYPOTENUSE) < EPSILON,
    );
    expect(onEdge).toHaveLength(41);
  });

  it('turns every surface triangle face up', () => {
    for (let face = 0; face < faces; face += 1) {
      expect(polygonArea(triangleCorners(surface, face))).toBeGreaterThan(0);
    }
  });
});

describe('buildGroundMesh skirt around a triangle outline', () => {
  const skirt = skirtOf(meshOn(TRIANGLE));

  it('drops from the outline to the base under the island', () => {
    const ys = usedVertices(skirt).map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(2 - SKIRT_DEPTH, 4);
    usedVertices(skirt).forEach(([x, , z]) => {
      const onSide = Math.abs(x) < EPSILON || Math.abs(z) < EPSILON;
      expect(onSide || Math.abs(x + z - HYPOTENUSE) < EPSILON).toBe(true);
    });
  });

  it('faces every side outward, away from the middle of the triangle', () => {
    const middle = HYPOTENUSE / 3;
    for (let face = 0; face < skirt.indices.length / 3; face += 1) {
      const { normal, centre } = faceOnGround(skirt, face);
      const outward = normal.x * (centre.x - middle) + normal.z * (centre.z - middle);
      expect(outward).toBeGreaterThan(0);
    }
  });
});

describe('buildGroundMesh inside an L outline', () => {
  it('covers the L and leaves its cut quarter open', () => {
    const surface = surfaceOf(meshOn(L_SHAPE));
    expect(meshGroundArea(surface)).toBeCloseTo(1600 - 400, 6);
    usedVertices(surface).forEach(([x, , z]) => {
      expect(x <= 20 + EPSILON || z <= 20 + EPSILON).toBe(true);
    });
  });
});

describe('buildGroundMesh inside an outline that crosses cells', () => {
  const surface = surfaceOf(meshOn(OFF_GRID_TRIANGLE));

  it('cuts the crossed cells so the area is the triangle area', () => {
    expect(meshGroundArea(surface)).toBeCloseTo((40 * 27.3) / 2, 4);
  });

  it('puts the cut vertices on the ground at the terrain height', () => {
    usedVertices(surface).forEach(([x, y, z]) => {
      expect(x / 40 + z / 27.3).toBeLessThanOrEqual(1 + 1e-6);
      expect(y).toBeCloseTo(2 + 0.05 * x + 0.02 * z, 4);
    });
  });
});

describe('buildGroundMesh on a rectangular parcel', () => {
  it('draws Jonathan Rogers Park exactly as the box grid it always drew', () => {
    const grid = makeFlatHeightmap({ width: 176, height: 86 });
    const outline = [
      { x: 0.2804529449417464, y: 85.48059347584964 },
      { x: 175.20861999327903, y: 80.53539075748942 },
      { x: 173.02712226473213, y: 0 },
      { x: 0, y: 4.74887392353963 },
    ];
    const before = buildTerrainMesh(grid, { skirtDepthM: SKIRT_DEPTH });
    const after = buildGroundMesh(withGroundOutline(grid, outline), { skirtDepthM: SKIRT_DEPTH });
    expect(after.positions).toEqual(before.positions);
    expect(after.indices).toEqual(before.indices);
    expect(after.surfaceIndexCount).toBe(175 * 85 * 6);
  });
});
