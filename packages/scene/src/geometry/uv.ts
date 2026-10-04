import { VECTOR_SIZE, Z_OFFSET } from './vector-layout.js';

const UV_SIZE = 2;

/** UVs in metres from the x and z of each vertex, so ground maps tile at a real-world size. */
export function metreUvs(positions: Float32Array): Float32Array {
  const count = positions.length / VECTOR_SIZE;
  const uvs = new Float32Array(count * UV_SIZE);
  for (let v = 0; v < count; v += 1) {
    uvs[v * UV_SIZE] = positions[v * VECTOR_SIZE] ?? 0;
    uvs[v * UV_SIZE + 1] = positions[v * VECTOR_SIZE + Z_OFFSET] ?? 0;
  }
  return uvs;
}
