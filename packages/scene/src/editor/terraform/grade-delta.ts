import { metres, type DesignDocument } from '@parkshape/core';

import type { DeltaPatch, GradeCellDelta } from './types.js';

type GradeDelta = DesignDocument['gradeDelta'];

const key = (x: number, y: number): string => `${String(x)},${String(y)}`;

/** Sums repeated cells into a map keyed by grid position. */
function accumulate(
  cells: readonly GradeCellDelta[],
  sign: number,
  into: Map<string, GradeCellDelta>,
): void {
  cells.forEach((cell) => {
    const existing = into.get(key(cell.x, cell.y));
    const deltaM = (existing?.deltaM ?? 0) + sign * cell.deltaM;
    into.set(key(cell.x, cell.y), { x: cell.x, y: cell.y, deltaM });
  });
}

/** Drops cells whose coalesced delta is zero and brands the rest into grade cells. */
function toGradeDelta(map: Map<string, GradeCellDelta>): GradeDelta {
  const cells = [...map.values()]
    .filter((cell) => cell.deltaM !== 0)
    .map((cell) => ({ x: cell.x, y: cell.y, deltaM: metres(cell.deltaM) }));
  return { cells };
}

/** Adds a patch onto a grade delta, coalescing cells that share a position. */
export function mergeGradeDelta(base: DeltaPatch, patch: DeltaPatch): GradeDelta {
  const map = new Map<string, GradeCellDelta>();
  accumulate(base.cells, 1, map);
  accumulate(patch.cells, 1, map);
  return toGradeDelta(map);
}

/** Removes a patch from a grade delta, the inverse of mergeGradeDelta. */
export function subtractGradeDelta(base: DeltaPatch, patch: DeltaPatch): GradeDelta {
  const map = new Map<string, GradeCellDelta>();
  accumulate(base.cells, 1, map);
  accumulate(patch.cells, -1, map);
  return toGradeDelta(map);
}

/** The accumulated delta at each flat cell index, for clamp and readouts. */
export function deltaField(width: number, delta: DeltaPatch): Map<number, number> {
  const field = new Map<number, number>();
  delta.cells.forEach((cell) => {
    const index = cell.y * width + cell.x;
    field.set(index, (field.get(index) ?? 0) + cell.deltaM);
  });
  return field;
}
