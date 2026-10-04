import { polygonContains, ringEdges, type Edge, type PlanePoint } from '../schema/geometry.js';

import type { SiteContext } from './context-feature.js';

/** DESIGN.md Snapping: a path end or Gate this close to a sidewalk snaps to the parcel edge. */
export const ENTRANCE_SNAP_RADIUS_M = 5;
/** How far inside the edge a snapped entrance sits, as the solver's entrance cells do. */
export const ENTRANCE_SNAP_INSET_M = 1.5;

// Two points this close are one point, so a nearest point on a corner reads as the corner.
const SAME_POINT_M = 1e-6;

export interface EntranceSnapInput {
  readonly point: PlanePoint;
  /** The parcel boundary in the local frame. */
  readonly parcel: readonly PlanePoint[];
  /** Sidewalk centrelines in the same frame. */
  readonly sidewalks: readonly (readonly PlanePoint[])[];
  /** The free-place modifier (Alt) turns the snap off while it is held. */
  readonly modifier: 'held' | 'released';
}

/** Where an entrance lands, and the sidewalk point it snapped toward. */
export type EntranceSnap =
  | { readonly kind: 'snapped'; readonly point: PlanePoint; readonly sidewalk: PlanePoint }
  | { readonly kind: 'free'; readonly point: PlanePoint };

interface Nearest {
  readonly point: PlanePoint;
  readonly distance: number;
  readonly edge: Edge;
}

function nearestOnEdge(edge: Edge, point: PlanePoint): Nearest {
  const { from, to } = edge;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);
  const onEdge = { x: from.x + dx * t, y: from.y + dy * t };
  return { point: onEdge, distance: Math.hypot(point.x - onEdge.x, point.y - onEdge.y), edge };
}

function nearestOf(edges: readonly Edge[], point: PlanePoint): Nearest | undefined {
  return edges.reduce<Nearest | undefined>((best, edge) => {
    const candidate = nearestOnEdge(edge, point);
    return best === undefined || candidate.distance < best.distance ? candidate : best;
  }, undefined);
}

function lineEdges(line: readonly PlanePoint[]): Edge[] {
  return line.slice(1).map((to, index) => ({ from: line[index] ?? to, to }));
}

function centroidOf(polygon: readonly PlanePoint[]): PlanePoint {
  const total = polygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / polygon.length, y: total.y / polygon.length };
}

function stepToward(from: PlanePoint, target: PlanePoint, distance: number): PlanePoint {
  const length = Math.hypot(target.x - from.x, target.y - from.y);
  if (length === 0) return from;
  const step = Math.min(distance, length) / length;
  return { x: from.x + (target.x - from.x) * step, y: from.y + (target.y - from.y) * step };
}

function isCorner(edge: Edge, point: PlanePoint): boolean {
  return [edge.from, edge.to].some(
    (end) => Math.hypot(end.x - point.x, end.y - point.y) < SAME_POINT_M,
  );
}

/** Moves an edge point straight into the parcel; a corner moves toward the middle instead. */
function insetFrom(parcel: readonly PlanePoint[], nearest: Nearest): PlanePoint {
  const { edge, point } = nearest;
  if (!isCorner(edge, point)) {
    const length = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y);
    const normal = {
      x: -(edge.to.y - edge.from.y) / length,
      y: (edge.to.x - edge.from.x) / length,
    };
    const inset = (sign: number) => ({
      x: point.x + sign * normal.x * ENTRANCE_SNAP_INSET_M,
      y: point.y + sign * normal.y * ENTRANCE_SNAP_INSET_M,
    });
    const inside = [inset(1), inset(-1)].find((candidate) => polygonContains(parcel, candidate));
    if (inside !== undefined) return inside;
  }
  return stepToward(point, centroidOf(parcel), ENTRANCE_SNAP_INSET_M);
}

/**
 * Snaps an entrance within ENTRANCE_SNAP_RADIUS_M of a sidewalk to the parcel edge point nearest
 * that sidewalk point, inset ENTRANCE_SNAP_INSET_M into the parcel.
 */
export function snapEntrance(input: EntranceSnapInput): EntranceSnap {
  const { point, parcel } = input;
  const free: EntranceSnap = { kind: 'free', point };
  if (input.modifier === 'held') return free;
  const sidewalk = nearestOf(input.sidewalks.flatMap(lineEdges), point);
  if (sidewalk === undefined || sidewalk.distance > ENTRANCE_SNAP_RADIUS_M) return free;
  const edge = nearestOf(ringEdges(parcel), sidewalk.point);
  if (edge === undefined) return free;
  return { kind: 'snapped', point: insetFrom(parcel, edge), sidewalk: sidewalk.point };
}

/** The sidewalk centrelines of a site context, for snapEntrance. */
export function sidewalkLinesOf(context: SiteContext): PlanePoint[][] {
  return context.features.flatMap((feature) =>
    feature.kind === 'sidewalk' && feature.geometry.type === 'line'
      ? [[...feature.geometry.points]]
      : [],
  );
}
