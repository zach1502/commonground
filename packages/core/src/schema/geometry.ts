import { z } from 'zod';

import { metresSchema, squareMetres, type SquareMetres } from './units.js';

const HALF = 0.5;

/** A point in the parcel's local frame: metres east (x) and north (y) of the origin. */
export const localPointSchema = z.strictObject({ x: metresSchema, y: metresSchema });
/** A closed ring of at least 3 points; the last point connects back to the first. */
export const polygonSchema = z.tuple(
  [localPointSchema, localPointSchema, localPointSchema],
  localPointSchema,
);
export const polylineSchema = z.tuple([localPointSchema, localPointSchema], localPointSchema);

export type LocalPoint = z.infer<typeof localPointSchema>;
/**
 * A point in the same frame without the Metres brand, for positions the metrics compute in
 * bulk (cell centres, samples). Every LocalPoint is also a PlanePoint.
 */
export interface PlanePoint {
  readonly x: number;
  readonly y: number;
}
export type Polygon = z.infer<typeof polygonSchema>;
export type Polyline = z.infer<typeof polylineSchema>;

export interface Edge {
  readonly from: PlanePoint;
  readonly to: PlanePoint;
}

/** Each side of the ring as a from and to pair, including the closing side. */
export function ringEdges(polygon: readonly PlanePoint[]): Edge[] {
  const [first, ...rest] = polygon;
  if (first === undefined) return [];
  let from = first;
  return [...rest, first].map((to) => {
    const edge = { from, to };
    from = to;
    return edge;
  });
}

/** Twice the signed area of the triangle (from, to, point); positive when point is left of the edge. */
function sideOf(edge: Edge, point: PlanePoint): number {
  const { from, to } = edge;
  return (to.x - from.x) * (point.y - from.y) - (point.x - from.x) * (to.y - from.y);
}

function windingStep(edge: Edge, point: PlanePoint): number {
  if (edge.from.y <= point.y) {
    return edge.to.y > point.y && sideOf(edge, point) > 0 ? 1 : 0;
  }
  return edge.to.y <= point.y && sideOf(edge, point) < 0 ? -1 : 0;
}

/** Shoelace area; the winding order does not matter. */
export function polygonArea(polygon: Polygon): SquareMetres {
  const twiceSigned = ringEdges(polygon).reduce(
    (total, { from, to }) => total + from.x * to.y - to.x * from.y,
    0,
  );
  return squareMetres(Math.abs(twiceSigned) * HALF);
}

/** Winding-number test. Points exactly on an edge are not guaranteed either way. */
export function polygonContains(polygon: readonly PlanePoint[], point: PlanePoint): boolean {
  const winding = ringEdges(polygon).reduce((total, edge) => total + windingStep(edge, point), 0);
  return winding !== 0;
}
