import type { Heightmap } from '@parkshape/core';

import type { GroundPoint } from '../types.js';

const HALF_CELL = 0.5;

/**
 * Where grid node (i, j) sits on the ground: the centre of core's cell (i, j), at
 * originLocal + (i + 0.5, j + 0.5) * resolutionM. Core's local y is the scene's z.
 */
export function nodePoint(heightmap: Heightmap, i: number, j: number): GroundPoint {
  const { originLocal, resolutionM } = heightmap;
  return {
    x: originLocal.x + (i + HALF_CELL) * resolutionM,
    z: originLocal.y + (j + HALF_CELL) * resolutionM,
  };
}

/** A ground point as fractional node indexes; the inverse of nodePoint. */
export function nodeCoordinates(heightmap: Heightmap, point: GroundPoint) {
  const { originLocal, resolutionM } = heightmap;
  return {
    u: (point.x - originLocal.x) / resolutionM - HALF_CELL,
    v: (point.z - originLocal.y) / resolutionM - HALF_CELL,
  };
}
