import type { Heightmap } from '@parkshape/core';

type ElevationAt = (x: number, z: number) => number;

const HALF_CELL = 0.5;

/**
 * Builds a heightmap from a function of ground position; shared by tests and the dev page.
 * The origin sits half a cell below zero, so node (i, j) lands at (i, j) * resolutionM.
 */
export function heightmapFrom(
  size: { readonly width: number; readonly height: number; readonly resolutionM: number },
  elevationAt: ElevationAt,
): Heightmap {
  const elevations = new Float32Array(size.width * size.height);
  for (let j = 0; j < size.height; j += 1) {
    for (let i = 0; i < size.width; i += 1) {
      elevations[j * size.width + i] = elevationAt(i * size.resolutionM, j * size.resolutionM);
    }
  }
  const offset = -HALF_CELL * size.resolutionM;
  return { ...size, elevations, originLocal: { x: offset, y: offset } };
}
