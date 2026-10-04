import type { MeshArrays } from '../types.js';

import { HALF, VECTOR_SIZE, Z_OFFSET } from './vector-layout.js';

const UV_SIZE = 2;
// buildRibbon writes a left and a right vertex for each centreline point.
const SIDES = 2;

function vertexXz(positions: Float32Array, vertex: number): { x: number; z: number } {
  return {
    x: positions[vertex * VECTOR_SIZE] ?? 0,
    z: positions[vertex * VECTOR_SIZE + Z_OFFSET] ?? 0,
  };
}

/**
 * UVs in metres for a ribbon from buildRibbon: u runs across the path from 0 to its width and v
 * runs along the centreline, so a texture set to a 1 m repeat tiles at real size.
 */
export function ribbonUvs(arrays: MeshArrays): Float32Array {
  const pairs = arrays.positions.length / VECTOR_SIZE / SIDES;
  const uvs = new Float32Array(pairs * SIDES * UV_SIZE);
  let along = 0;
  let previous: { x: number; z: number } | undefined;
  for (let pair = 0; pair < pairs; pair += 1) {
    const left = vertexXz(arrays.positions, pair * SIDES);
    const right = vertexXz(arrays.positions, pair * SIDES + 1);
    const middle = { x: (left.x + right.x) * HALF, z: (left.z + right.z) * HALF };
    if (previous !== undefined) along += Math.hypot(middle.x - previous.x, middle.z - previous.z);
    previous = middle;
    const across = Math.hypot(right.x - left.x, right.z - left.z);
    uvs.set([0, along, across, along], pair * SIDES * UV_SIZE);
  }
  return uvs;
}
