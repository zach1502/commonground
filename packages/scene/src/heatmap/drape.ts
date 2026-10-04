import type { Heightmap } from '@parkshape/core';

import { valueAt } from '../geometry/arrays.js';
import { buildGroundMesh } from '../geometry/ground-mesh.js';
import { VECTOR_SIZE, Y_OFFSET, Z_OFFSET } from '../geometry/vector-layout.js';

const UV_SIZE = 2;

/** Where a heat grid lies in local metres: cells row by row from originLocal. */
export interface HeatGridFrame {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  readonly originLocal: { readonly x: number; readonly y: number };
}

export interface DrapeArrays {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export interface DrapeOptions {
  /** Height above the ground, so the overlay never flickers into the terrain. */
  readonly liftM: number;
}

/**
 * A copy of the terrain's top surface with texture coordinates on the heat grid. It is the same
 * ground the island draws, so a parcel cut to its outline shows no heat outside it.
 */
export function buildDrapeArrays(
  heightmap: Heightmap,
  frame: HeatGridFrame,
  options: DrapeOptions,
): DrapeArrays {
  const ground = buildGroundMesh(heightmap, { skirtDepthM: 0 });
  const count = ground.surfaceVertexCount;
  const positions = ground.positions.slice(0, count * VECTOR_SIZE);
  const uvs = new Float32Array(count * UV_SIZE);
  const spanX = frame.width * frame.cellM;
  const spanY = frame.height * frame.cellM;
  for (let index = 0; index < count; index += 1) {
    const at = index * VECTOR_SIZE;
    const x = valueAt(positions, at);
    const z = valueAt(positions, at + Z_OFFSET);
    positions[at + Y_OFFSET] = valueAt(positions, at + Y_OFFSET) + options.liftM;
    uvs.set(
      [(x - frame.originLocal.x) / spanX, (z - frame.originLocal.y) / spanY],
      index * UV_SIZE,
    );
  }
  return { positions, uvs, indices: ground.indices.slice(0, ground.surfaceIndexCount) };
}
