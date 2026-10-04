import type { Heightmap } from '@parkshape/core';

import { buildOutlineMesh } from './outline-mesh.js';
import { buildTerrainMesh, type TerrainArrays, type TerrainMeshOptions } from './terrain-mesh.js';

/**
 * The island's ground: the whole grid box, or only the part inside the parcel outline when the
 * heightmap carries one.
 */
export function buildGroundMesh(heightmap: Heightmap, options: TerrainMeshOptions): TerrainArrays {
  const outline = heightmap.groundOutline;
  return outline === undefined
    ? buildTerrainMesh(heightmap, options)
    : buildOutlineMesh(heightmap, outline, options);
}
