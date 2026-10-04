import type { PlanePoint } from '@parkshape/core';

/** DESIGN.md: snap to a 0.5 m grid is on by default. */
export const SNAP_STEP_M = 0.5;
/** How close an item has to be on one axis before a drag lines up with it. */
export const ALIGN_TOLERANCE_M = 0.3;

export type SnapMode = 'grid' | 'free';

export interface SnapInput {
  readonly toggle: 'on' | 'off';
  /** Holding Alt turns snapping off while you drag. */
  readonly alt: 'held' | 'released';
}

// Adding 0 turns a -0 from Math.round into 0.
const roundTo = (value: number, step: number) => Math.round(value / step) * step + 0;

export function snapToGrid(point: PlanePoint, stepM: number): PlanePoint {
  return { x: roundTo(point.x, stepM), y: roundTo(point.y, stepM) };
}

export function snapModeOf({ toggle, alt }: SnapInput): SnapMode {
  return toggle === 'on' && alt === 'released' ? 'grid' : 'free';
}

export function snapPoint(point: PlanePoint, mode: SnapMode): PlanePoint {
  return mode === 'grid' ? snapToGrid(point, SNAP_STEP_M) : point;
}

export interface Neighbour {
  readonly id: string;
  readonly position: PlanePoint;
}

export interface AlignmentGuide {
  readonly axis: 'x' | 'y';
  readonly value: number;
  readonly sourceId: string;
}

function closestOnAxis(
  value: number,
  neighbours: readonly Neighbour[],
  axis: 'x' | 'y',
  toleranceM: number,
): AlignmentGuide | null {
  const gapOf = (neighbour: Neighbour) => Math.abs(neighbour.position[axis] - value);
  const nearest = neighbours
    .filter((neighbour) => gapOf(neighbour) <= toleranceM)
    .reduce<Neighbour | null>(
      (best, neighbour) => (best === null || gapOf(neighbour) < gapOf(best) ? neighbour : best),
      null,
    );
  return nearest === null ? null : { axis, value: nearest.position[axis], sourceId: nearest.id };
}

/** Lines a point up with the nearest item on each axis, and lists the guides to draw. */
export function alignToNeighbours(
  point: PlanePoint,
  neighbours: readonly Neighbour[],
  toleranceM: number,
): { readonly point: PlanePoint; readonly guides: readonly AlignmentGuide[] } {
  const onX = closestOnAxis(point.x, neighbours, 'x', toleranceM);
  const onY = closestOnAxis(point.y, neighbours, 'y', toleranceM);
  const guides = [onX, onY].filter((guide): guide is AlignmentGuide => guide !== null);
  return { point: { x: onX?.value ?? point.x, y: onY?.value ?? point.y }, guides };
}
