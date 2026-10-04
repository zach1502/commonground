import { describe, expect, it } from 'vitest';

import { isInsidePolygon } from '../geometry/polygon.js';
import { buildRibbonOn } from '../geometry/ribbon.js';
import type { GroundPoint, MeshArrays } from '../types.js';

import { clipMeshOutside, linePiecesOutside } from './outside-clip.js';

const rectangle: GroundPoint[] = [
  { x: 0, z: 0 },
  { x: 100, z: 0 },
  { x: 100, z: 60 },
  { x: 0, z: 60 },
];
const triangle: GroundPoint[] = [
  { x: 0, z: 0 },
  { x: 100, z: 0 },
  { x: 0, z: 80 },
];
const flat = () => 10;

function vertexOf(mesh: MeshArrays, vertex: number) {
  return {
    x: mesh.positions[vertex * 3] ?? 0,
    y: mesh.positions[vertex * 3 + 1] ?? 0,
    z: mesh.positions[vertex * 3 + 2] ?? 0,
  };
}

function distanceToRing(ring: readonly GroundPoint[], point: GroundPoint): number {
  return Math.min(
    ...ring.map((from, index) => {
      const to = ring[(index + 1) % ring.length] ?? from;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const t = Math.min(
        Math.max(((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz), 0),
        1,
      );
      return Math.hypot(from.x + dx * t - point.x, from.z + dz * t - point.z);
    }),
  );
}

// Positions are 32-bit floats, so a point on the edge may sit this far either side of it.
const FLOAT_SLACK_M = 1e-4;
const strictlyInside = (ring: readonly GroundPoint[], point: GroundPoint) =>
  isInsidePolygon(ring, point) && distanceToRing(ring, point) > FLOAT_SLACK_M;

function triangleCentres(mesh: MeshArrays): GroundPoint[] {
  const centres: GroundPoint[] = [];
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const corners = [0, 1, 2].map((n) => vertexOf(mesh, mesh.indices[k + n] ?? 0));
    centres.push({
      x: corners.reduce((sum, corner) => sum + corner.x, 0) / 3,
      z: corners.reduce((sum, corner) => sum + corner.z, 0) / 3,
    });
  }
  return centres;
}

function areaOf(mesh: MeshArrays): number {
  let area = 0;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const [a, b, c] = [0, 1, 2].map((n) => vertexOf(mesh, mesh.indices[k + n] ?? 0));
    if (a === undefined || b === undefined || c === undefined) continue;
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  }
  return area;
}

function expectNothingInside(mesh: MeshArrays, ring: readonly GroundPoint[]) {
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    expect(strictlyInside(ring, vertexOf(mesh, vertex))).toBe(false);
  }
  triangleCentres(mesh).forEach((centre) => {
    expect(isInsidePolygon(ring, centre)).toBe(false);
  });
}

// A 10 m street from west of the parcel to east of it, along z = 30.
const crossing = buildRibbonOn(
  flat,
  Array.from({ length: 41 }, (_, k) => ({ x: -50 + k * 5, z: 30 })),
  { widthM: 10, liftM: 0.03 },
);

describe('clipMeshOutside', () => {
  it('leaves no part of a street crossing a rectangular parcel inside it', () => {
    const clipped = clipMeshOutside(crossing, rectangle);
    expectNothingInside(clipped, rectangle);
    expect(areaOf(clipped)).toBeCloseTo(areaOf(crossing) - 100 * 10, 4);
  });

  it('leaves no part of a street crossing a triangular parcel inside it', () => {
    const clipped = clipMeshOutside(crossing, triangle);
    expectNothingInside(clipped, triangle);
    // The triangle's width at z = 25 is 68.75 m and at z = 35 it is 56.25 m.
    expect(areaOf(clipped)).toBeCloseTo(areaOf(crossing) - 625, 4);
  });

  it('keeps the street on its ground and lift where it is cut', () => {
    const clipped = clipMeshOutside(crossing, triangle);
    for (let vertex = 0; vertex < clipped.positions.length / 3; vertex += 1) {
      expect(vertexOf(clipped, vertex).y).toBeCloseTo(10.03, 5);
      expect(clipped.normals[vertex * 3 + 1]).toBeCloseTo(1, 5);
    }
  });

  it('returns a street wholly outside the parcel unchanged', () => {
    const outside = buildRibbonOn(
      flat,
      [
        { x: -50, z: 90 },
        { x: 150, z: 90 },
      ],
      { widthM: 10 },
    );
    expect(clipMeshOutside(outside, rectangle)).toBe(outside);
    expect(clipMeshOutside(outside, triangle)).toBe(outside);
  });

  it('drops a street wholly inside the parcel', () => {
    const inside = buildRibbonOn(
      flat,
      [
        { x: 20, z: 30 },
        { x: 80, z: 30 },
      ],
      { widthM: 4 },
    );
    const clipped = clipMeshOutside(inside, rectangle);
    expect(clipped.indices).toHaveLength(0);
    expect(clipped.positions).toHaveLength(0);
  });
});

describe('linePiecesOutside', () => {
  it('splits a centreline at the parcel edge and keeps the outside pieces', () => {
    const pieces = linePiecesOutside(
      [
        { x: -50, z: 30 },
        { x: 150, z: 30 },
      ],
      rectangle,
    );
    expect(pieces).toEqual([
      [
        { x: -50, z: 30 },
        { x: 0, z: 30 },
      ],
      [
        { x: 100, z: 30 },
        { x: 150, z: 30 },
      ],
    ]);
  });

  it('keeps nothing of a line wholly inside the parcel', () => {
    const pieces = linePiecesOutside(
      [
        { x: 10, z: 10 },
        { x: 20, z: 20 },
      ],
      triangle,
    );
    expect(pieces).toEqual([]);
  });
});
