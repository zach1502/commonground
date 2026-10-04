import type { GroundPoint, MeshArrays } from '../types.js';

import { itemAt, valueAt } from './arrays.js';
import { HALF, VECTOR_SIZE, Y_OFFSET, Z_OFFSET } from './vector-layout.js';

/** Signed ground area of an outline; positive when its fan triangles face up. */
export function polygonArea(outline: readonly GroundPoint[]): number {
  let twice = 0;
  outline.forEach((point, index) => {
    const next = itemAt(outline, index + 1);
    twice += next.x * point.z - point.x * next.z;
  });
  return twice * HALF;
}

function positionAt(mesh: MeshArrays, vertex: number): GroundPoint {
  return {
    x: valueAt(mesh.positions, vertex * VECTOR_SIZE),
    z: valueAt(mesh.positions, vertex * VECTOR_SIZE + Z_OFFSET),
  };
}

/** Ground-plane corners of one triangle of a mesh. */
export function triangleCorners(mesh: MeshArrays, face: number): GroundPoint[] {
  return [0, Y_OFFSET, Z_OFFSET].map((k) =>
    positionAt(mesh, valueAt(mesh.indices, face * VECTOR_SIZE + k)),
  );
}

/** Total area of a mesh's triangles projected on the ground plane, in square metres. */
export function meshGroundArea(mesh: MeshArrays): number {
  let total = 0;
  for (let face = 0; face < mesh.indices.length / VECTOR_SIZE; face += 1) {
    total += Math.abs(polygonArea(triangleCorners(mesh, face)));
  }
  return total;
}
