import { MinHeap } from './min-heap.js';
import { readAt } from './read-at.js';

const HALF = 0.5;

/** Cost per metre of walking over each cell; Infinity where a path may not go. Every cost is at least 1. */
export interface CostGrid {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  readonly cost: Float64Array;
  /**
   * Optional step mask per cell: bit k is set when STEPS[k] out of the cell is allowed (see
   * stepBit). Without it every step into a passable cell is allowed.
   */
  readonly steps?: Uint8Array;
  /** Extra cost per metre of a step outside the mask. Without it such steps are ruled out. */
  readonly stepPenalty?: number;
}

interface Step {
  readonly di: number;
  readonly dj: number;
  readonly length: number;
}

const STEPS: readonly Step[] = [
  { di: 1, dj: 0, length: 1 },
  { di: -1, dj: 0, length: 1 },
  { di: 0, dj: 1, length: 1 },
  { di: 0, dj: -1, length: 1 },
  { di: 1, dj: 1, length: Math.SQRT2 },
  { di: 1, dj: -1, length: Math.SQRT2 },
  { di: -1, dj: 1, length: Math.SQRT2 },
  { di: -1, dj: -1, length: Math.SQRT2 },
];

/** Every one of the 8 step bits set. */
export const ALL_STEPS = 0xff;

/** The mask bit for the step (di, dj), or 0 when it is not one of the 8 steps. */
export function stepBit(di: number, dj: number): number {
  const index = STEPS.findIndex((step) => step.di === di && step.dj === dj);
  return index === -1 ? 0 : 1 << index;
}

/** The 8 steps as offsets, in mask bit order. */
export function stepOffsets(): readonly { readonly di: number; readonly dj: number }[] {
  return STEPS.map(({ di, dj }) => ({ di, dj }));
}

interface Search {
  readonly grid: CostGrid;
  readonly goal: number;
  readonly best: Float64Array;
  readonly cameFrom: Int32Array;
  readonly open: MinHeap;
}

function costAt(grid: CostGrid, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return Infinity;
  return readAt(grid.cost, j * grid.width + i, Infinity);
}

/** Straight-line metres to the goal; a lower bound because every cost is at least 1. */
function heuristic(grid: CostGrid, from: number, to: number): number {
  const di = (from % grid.width) - (to % grid.width);
  const dj = Math.floor(from / grid.width) - Math.floor(to / grid.width);
  return Math.hypot(di, dj) * grid.cellM;
}

/** Extra cost per metre for a step the mask leaves out: the penalty, or Infinity without one. */
function maskPenalty(grid: CostGrid, index: number, bit: number): number {
  if (grid.steps === undefined || (readAt(grid.steps, index, 0) & bit) !== 0) return 0;
  return grid.stepPenalty ?? Infinity;
}

/**
 * Cost of one step, or Infinity when it enters a blocked cell, cuts a blocked corner or the step
 * mask rules it out.
 */
function stepCost(grid: CostGrid, index: number, step: Step, bit: number): number {
  const penalty = maskPenalty(grid, index, bit);
  if (penalty === Infinity) return Infinity;
  const i = index % grid.width;
  const j = Math.floor(index / grid.width);
  const target = costAt(grid, i + step.di, j + step.dj);
  const diagonal = step.di !== 0 && step.dj !== 0;
  if (
    diagonal &&
    (costAt(grid, i + step.di, j) === Infinity || costAt(grid, i, j + step.dj) === Infinity)
  ) {
    return Infinity;
  }
  return step.length * grid.cellM * ((costAt(grid, i, j) + target) * HALF + penalty);
}

function expand(search: Search, index: number): void {
  const { grid, best, cameFrom, open, goal } = search;
  STEPS.forEach((step, stepIndex) => {
    const cost = stepCost(grid, index, step, 1 << stepIndex);
    if (cost === Infinity) return;
    const next = index + step.dj * grid.width + step.di;
    const through = readAt(best, index, Infinity) + cost;
    if (through >= readAt(best, next, Infinity)) return;
    best[next] = through;
    cameFrom[next] = index;
    open.push(next, through + heuristic(grid, next, goal));
  });
}

/** Cells one allowed step from the cell, as A* would expand them. */
export function neighboursOf(grid: CostGrid, index: number): number[] {
  return STEPS.flatMap((step, stepIndex) =>
    stepCost(grid, index, step, 1 << stepIndex) === Infinity
      ? []
      : [index + step.dj * grid.width + step.di],
  );
}

function trace(cameFrom: Int32Array, goal: number): number[] {
  const path = [goal];
  let current = readAt(cameFrom, goal, -1);
  while (current !== -1) {
    path.push(current);
    current = readAt(cameFrom, current, -1);
  }
  return path.reverse();
}

/** Cheapest 8-connected route of cell indexes from start to goal, or undefined when none exists. */
export function findPath(grid: CostGrid, start: number, goal: number): number[] | undefined {
  const cells = grid.width * grid.height;
  const search: Search = {
    grid,
    goal,
    best: new Float64Array(cells).fill(Infinity),
    cameFrom: new Int32Array(cells).fill(-1),
    open: new MinHeap(),
  };
  search.best[start] = 0;
  search.open.push(start, heuristic(grid, start, goal));
  const closed = new Uint8Array(cells);
  for (let index = search.open.pop(); index !== undefined; index = search.open.pop()) {
    if (index === goal) return trace(search.cameFrom, goal);
    if (closed[index] === 1) continue;
    closed[index] = 1;
    expand(search, index);
  }
  return undefined;
}
