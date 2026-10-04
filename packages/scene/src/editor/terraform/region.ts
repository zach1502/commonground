import type { Grid } from '@parkshape/core';

import type { DeltaPatch } from './types.js';

/** Inclusive cell-index bounds of a rebuilt terrain region. */
export interface CellRegion {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** How far the region grows past the touched cells so shared normals recompute correctly. */
const NORMAL_MARGIN = 1;

/**
 * The bounding box of a patch's cells, grown by one so the vertices whose normals depend on a
 * changed neighbour are rebuilt too, then clamped to the grid. Returns null for an empty patch.
 */
export function patchRegion(patch: DeltaPatch, grid: Grid): CellRegion | null {
  if (patch.cells.length === 0) return null;
  const xs = patch.cells.map((cell) => cell.x);
  const ys = patch.cells.map((cell) => cell.y);
  return {
    minX: Math.max(0, Math.min(...xs) - NORMAL_MARGIN),
    minY: Math.max(0, Math.min(...ys) - NORMAL_MARGIN),
    maxX: Math.min(grid.width - 1, Math.max(...xs) + NORMAL_MARGIN),
    maxY: Math.min(grid.height - 1, Math.max(...ys) + NORMAL_MARGIN),
  };
}

/** Combines two regions into the box that covers both. */
export function unionRegion(a: CellRegion, b: CellRegion): CellRegion {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
