import { slopeAt, type Heightmap } from '../metrics/heightmap.js';
import {
  cellCentre,
  countCells,
  gridOf,
  rasterizePolygon,
  type Grid,
  type Mask,
} from '../metrics/raster.js';
import type { PlanePoint } from '../schema/geometry.js';
import type { Parcel } from '../schema/parcel.js';

import { readAt } from './read-at.js';

/** The terrain grid the solver works on, with the parcel and the slope under each cell. */
export interface Site {
  readonly grid: Grid;
  readonly parcel: Mask;
  readonly parcelCells: number;
  /** Steepest slope at each cell centre, rise over run. */
  readonly slope: Float64Array;
  /** Elevation at each cell centre, in metres. */
  readonly elevation: Float32Array;
  /** The terrain itself, for slope checks that sample between cell centres. */
  readonly heightmap: Heightmap;
  readonly polygon: readonly PlanePoint[];
}

export function indexOf(grid: Grid, i: number, j: number): number {
  return j * grid.width + i;
}

export function pointOf(grid: Grid, index: number): PlanePoint {
  return cellCentre(grid, index % grid.width, Math.floor(index / grid.width));
}

/** Index of the cell under a point, or undefined off the grid. */
export function cellAt(grid: Grid, point: PlanePoint): number | undefined {
  const i = Math.floor((point.x - grid.originLocal.x) / grid.cellM);
  const j = Math.floor((point.y - grid.originLocal.y) / grid.cellM);
  const inside = i >= 0 && j >= 0 && i < grid.width && j < grid.height;
  return inside ? indexOf(grid, i, j) : undefined;
}

export function buildSite(parcel: Parcel, heightmap: Heightmap): Site {
  const grid = gridOf(heightmap);
  const mask = rasterizePolygon(grid, parcel.polygon);
  const slope = new Float64Array(grid.width * grid.height);
  slope.forEach((_, index) => {
    slope[index] = slopeAt(heightmap, pointOf(grid, index));
  });
  return {
    grid,
    parcel: mask,
    parcelCells: countCells(mask),
    slope,
    elevation: heightmap.elevations,
    heightmap,
    polygon: parcel.polygon,
  };
}

interface Neighbour {
  readonly di: number;
  readonly dj: number;
  readonly weight: number;
}

const FORWARD: readonly Neighbour[] = [
  { di: -1, dj: 0, weight: 1 },
  { di: 0, dj: -1, weight: 1 },
  { di: -1, dj: -1, weight: Math.SQRT2 },
  { di: 1, dj: -1, weight: Math.SQRT2 },
];
const BACKWARD: readonly Neighbour[] = FORWARD.map(({ di, dj, weight }) => ({
  di: -di,
  dj: -dj,
  weight,
}));

function relax(field: Float64Array, grid: Grid, index: number, steps: readonly Neighbour[]) {
  const i = index % grid.width;
  const j = Math.floor(index / grid.width);
  steps.forEach(({ di, dj, weight }) => {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.height) return;
    const through = readAt(field, indexOf(grid, ni, nj), Infinity) + weight * grid.cellM;
    if (through < readAt(field, index, Infinity)) field[index] = through;
  });
}

/** Two-pass chamfer distance, in metres, from each cell to the nearest covered cell. */
export function distanceField(mask: Mask): Float64Array {
  const { grid } = mask;
  const field = new Float64Array(mask.cells.length).fill(Infinity);
  mask.cells.forEach((cell, index) => {
    if (cell === 1) field[index] = 0;
  });
  for (let index = 0; index < field.length; index += 1) relax(field, grid, index, FORWARD);
  for (let index = field.length - 1; index >= 0; index -= 1) relax(field, grid, index, BACKWARD);
  return field;
}

/** The allowed cell whose centre is closest to the point; ties go to the lower index. */
export function nearestAllowed(
  grid: Grid,
  allowed: Uint8Array,
  point: PlanePoint,
): number | undefined {
  let best: number | undefined;
  let bestDistance = Infinity;
  allowed.forEach((cell, index) => {
    if (cell !== 1) return;
    const centre = pointOf(grid, index);
    const distance = Math.hypot(centre.x - point.x, centre.y - point.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
