import { rasterizeRibbon } from '../metrics/raster.js';
import { withinSlopeLimits, type SlopeLimits } from '../metrics/slopes.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { CostGrid } from './astar.js';
import { readAt } from './read-at.js';
import { cellAt, pointOf, type Site } from './site.js';
import { catmullRom, everyNth, withoutCollinear, withoutRepeats } from './smooth.js';

/** Grid cells between spline control points. */
const CONTROL_STRIDE = 3;
const SAMPLES_PER_SPAN = 4;
/** A route needs a start and an end cell. */
const MIN_ROUTE_CELLS = 2;

export interface ShapeInput {
  readonly site: Site;
  readonly costs: CostGrid;
  readonly blocked: Uint8Array;
  readonly widthM: number;
  readonly limits: SlopeLimits;
}

function costOf(input: ShapeInput, point: PlanePoint): number {
  const cell = cellAt(input.site.grid, point);
  return cell === undefined ? Infinity : readAt(input.costs.cost, cell, Infinity);
}

/** The line is usable when no sample costs more than the route did and no cell of its width is blocked. */
function usable(input: ShapeInput, points: readonly PlanePoint[], maxCost: number): boolean {
  if (points.some((point) => costOf(input, point) > maxCost)) return false;
  const ribbon = rasterizeRibbon(input.site.grid, points, input.widthM);
  return !ribbon.cells.some((cell, index) => cell === 1 && input.blocked[index] === 1);
}

function withinLimits(input: ShapeInput, points: readonly PlanePoint[]): boolean {
  const line = { points, widthM: input.widthM };
  return withinSlopeLimits(input.site.heightmap, line, input.limits);
}

/**
 * A Catmull-Rom curve through the route, else the plain route with straight runs merged, else
 * the route cell by cell. The first that is usable and, re-sampled as the path check samples it,
 * within the slope limits wins: smoothing can cut a corner onto steeper ground. When none is
 * within the limits, the first usable one is kept, as the route itself breaks them.
 */
export function shapeRoute(input: ShapeInput, cells: readonly number[]): PlanePoint[] | undefined {
  if (cells.length < MIN_ROUTE_CELLS) return undefined;
  const raw = cells.map((cell) => pointOf(input.site.grid, cell));
  const maxCost = Math.max(...raw.map((point) => costOf(input, point)));
  const candidates = [
    withoutRepeats(catmullRom(everyNth(raw, CONTROL_STRIDE), SAMPLES_PER_SPAN)),
    withoutRepeats(withoutCollinear(raw)),
    withoutRepeats(raw),
  ].filter((points) => usable(input, points, maxCost));
  return candidates.find((points) => withinLimits(input, points)) ?? candidates[0];
}
