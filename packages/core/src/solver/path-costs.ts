import { SLOPE_TOLERANCE } from '../constants.js';
import type { Grid, Mask } from '../metrics/raster.js';

import type { CostGrid } from './astar.js';
import { boxSum, summedArea } from './cell-box.js';
import { readAt } from './read-at.js';
import type { Site } from './site.js';

/** The k in cost = 1 + k x slope, per metre walked. */
const SLOPE_COST = 20;
/** Extra cost per metre on cells steeper than the running slope limit, so paths go round them. */
const STEEP_COST = 1000;
/** Extra cost per metre inside a protected root zone. Paths do not grade, so they may cross one. */
const ROOT_ZONE_COST = 2;
const HALF = 0.5;

export interface PathCostInput {
  readonly site: Site;
  /** 1 where the path surface may not cover the cell. */
  readonly blocked: Uint8Array;
  readonly rootZones: Mask;
  readonly widthM: number;
  readonly maxRunning: number;
}

/** Marks every cell within radius cells (square neighbourhood) of a marked cell. */
export function dilate(grid: Grid, cells: Uint8Array, radius: number): Uint8Array {
  const table = summedArea(grid, (index) => readAt(cells, index, 0));
  return cells.map((_, index) => {
    const i = index % grid.width;
    const j = Math.floor(index / grid.width);
    const i0 = Math.max(0, i - radius);
    const j0 = Math.max(0, j - radius);
    const box = {
      i0,
      j0,
      columns: Math.min(grid.width, i + radius + 1) - i0,
      rows: Math.min(grid.height, j + radius + 1) - j0,
    };
    return boxSum(table, grid, box) > 0 ? 1 : 0;
  });
}

/** Cells a path centre line may cross, so the full width stays clear of blocked cells. */
export function clearanceCells(grid: Grid, widthM: number): number {
  return Math.ceil((widthM * HALF + Math.SQRT2 * grid.cellM) / grid.cellM);
}

function nearBorder(grid: Grid, index: number, radius: number): boolean {
  const i = index % grid.width;
  const j = Math.floor(index / grid.width);
  return i < radius || j < radius || i >= grid.width - radius || j >= grid.height - radius;
}

/** Walking cost per cell: slope-weighted, steep and root-zone penalties, Infinity where blocked. */
export function pathCostGrid(input: PathCostInput): CostGrid {
  const { site, maxRunning } = input;
  const { grid } = site;
  const radius = clearanceCells(grid, input.widthM);
  const blocked = dilate(grid, input.blocked, radius);
  const cost = new Float64Array(blocked.length).map((_, index) => {
    if (blocked[index] === 1 || nearBorder(grid, index, radius)) return Infinity;
    const slope = readAt(site.slope, index, 0);
    const steep = slope > maxRunning + SLOPE_TOLERANCE ? STEEP_COST : 0;
    const roots = input.rootZones.cells[index] === 1 ? ROOT_ZONE_COST : 0;
    return 1 + SLOPE_COST * slope + steep + roots;
  });
  return { width: grid.width, height: grid.height, cellM: grid.cellM, cost };
}
