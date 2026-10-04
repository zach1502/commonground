import type { Grid } from '../metrics/raster.js';
import type { PlanePoint } from '../schema/geometry.js';

import { readAt } from './read-at.js';

const HALF = 0.5;
const BOTH_SIDES = 2;

/** A rectangle of whole cells, by its south-west cell and its size. */
export interface CellBox {
  readonly i0: number;
  readonly j0: number;
  readonly columns: number;
  readonly rows: number;
}

/** Summed-area table with one extra row and column, so any box sums in four lookups. */
export function summedArea(grid: Grid, valueAt: (index: number) => number): Float64Array {
  const stride = grid.width + 1;
  const table = new Float64Array(stride * (grid.height + 1));
  for (let j = 0; j < grid.height; j += 1) {
    for (let i = 0; i < grid.width; i += 1) {
      const above = readAt(table, j * stride + i + 1, 0);
      const left = readAt(table, (j + 1) * stride + i, 0);
      const corner = readAt(table, j * stride + i, 0);
      table[(j + 1) * stride + i + 1] = valueAt(j * grid.width + i) + above + left - corner;
    }
  }
  return table;
}

export function boxSum(table: Float64Array, grid: Grid, box: CellBox): number {
  const stride = grid.width + 1;
  const at = (i: number, j: number) => readAt(table, j * stride + i, 0);
  const i1 = box.i0 + box.columns;
  const j1 = box.j0 + box.rows;
  return at(i1, j1) - at(box.i0, j1) - at(i1, box.j0) + at(box.i0, box.j0);
}

/** The cell at the middle of the box, rounding toward the south-west. */
export function boxCentreCell(grid: Grid, box: CellBox): number {
  const i = box.i0 + Math.floor((box.columns - 1) * HALF);
  const j = box.j0 + Math.floor((box.rows - 1) * HALF);
  return j * grid.width + i;
}

export function boxCentre(grid: Grid, box: CellBox): PlanePoint {
  return {
    x: grid.originLocal.x + (box.i0 + box.columns * HALF) * grid.cellM,
    y: grid.originLocal.y + (box.j0 + box.rows * HALF) * grid.cellM,
  };
}

/** Corners counter-clockwise from the south-west, on the cell edges. */
export function boxPolygon(grid: Grid, box: CellBox): PlanePoint[] {
  const minX = grid.originLocal.x + box.i0 * grid.cellM;
  const minY = grid.originLocal.y + box.j0 * grid.cellM;
  const maxX = minX + box.columns * grid.cellM;
  const maxY = minY + box.rows * grid.cellM;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function markBox(cells: Uint8Array, grid: Grid, box: CellBox): void {
  const firstI = Math.max(0, box.i0);
  const firstJ = Math.max(0, box.j0);
  const lastI = Math.min(grid.width, box.i0 + box.columns);
  const lastJ = Math.min(grid.height, box.j0 + box.rows);
  for (let j = firstJ; j < lastJ; j += 1) {
    for (let i = firstI; i < lastI; i += 1) cells[j * grid.width + i] = 1;
  }
}

export function grownBox(box: CellBox, margin: number): CellBox {
  return {
    i0: box.i0 - margin,
    j0: box.j0 - margin,
    columns: box.columns + margin * BOTH_SIDES,
    rows: box.rows + margin * BOTH_SIDES,
  };
}

/** Whole cells between two boxes along the axis where they are furthest apart; 0 when touching. */
export function boxGap(a: CellBox, b: CellBox): number {
  const gapX = Math.max(b.i0 - (a.i0 + a.columns), a.i0 - (b.i0 + b.columns));
  const gapY = Math.max(b.j0 - (a.j0 + a.rows), a.j0 - (b.j0 + b.rows));
  return Math.max(0, gapX, gapY);
}
