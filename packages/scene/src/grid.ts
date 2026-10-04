import { GRID_RESOLUTION_M } from '@parkshape/core';

/** Number of terrain grid cells covering a rectangular site, rounding partial cells up. */
export function gridCellCount(widthM: number, depthM: number): number {
  return Math.ceil(widthM / GRID_RESOLUTION_M) * Math.ceil(depthM / GRID_RESOLUTION_M);
}
