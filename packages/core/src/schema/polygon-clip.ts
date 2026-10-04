import type { PlanePoint } from './geometry.js';

const HALF = 0.5;
const MIN_RING_POINTS = 3;
// Points closer than this are one point, so a clip through a vertex adds no zero-length side.
const SAME_POINT_M = 1e-9;

/** An axis-aligned box in the parcel's local frame. */
export interface PlaneBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface BoxSide {
  readonly axis: 'x' | 'y';
  readonly limit: number;
  /** 'above' keeps points at or past the limit, 'below' keeps points at or before it. */
  readonly keep: 'above' | 'below';
}

function sidesOf(box: PlaneBox): BoxSide[] {
  return [
    { axis: 'x', limit: box.minX, keep: 'above' },
    { axis: 'x', limit: box.maxX, keep: 'below' },
    { axis: 'y', limit: box.minY, keep: 'above' },
    { axis: 'y', limit: box.maxY, keep: 'below' },
  ];
}

function isKept(side: BoxSide, point: PlanePoint): boolean {
  const value = point[side.axis];
  return side.keep === 'above' ? value >= side.limit : value <= side.limit;
}

/** Where the side from a to b meets the box side's line, with that coordinate exact. */
function crossing(side: BoxSide, a: PlanePoint, b: PlanePoint): PlanePoint {
  const t = (side.limit - a[side.axis]) / (b[side.axis] - a[side.axis]);
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  return side.axis === 'x' ? { x: side.limit, y } : { x, y: side.limit };
}

function clipToSide(ring: readonly PlanePoint[], side: BoxSide): PlanePoint[] {
  const kept: PlanePoint[] = [];
  let previous = ring[ring.length - 1];
  for (const current of ring) {
    if (previous === undefined) break;
    const currentKept = isKept(side, current);
    if (currentKept !== isKept(side, previous)) kept.push(crossing(side, previous, current));
    if (currentKept) kept.push(current);
    previous = current;
  }
  return kept;
}

function withoutRepeats(ring: readonly PlanePoint[]): PlanePoint[] {
  const same = (a: PlanePoint, b: PlanePoint | undefined) =>
    b !== undefined && Math.abs(a.x - b.x) < SAME_POINT_M && Math.abs(a.y - b.y) < SAME_POINT_M;
  const open = ring.filter((point, index) => !same(point, ring[index + 1]));
  const last = open[open.length - 1];
  return last !== undefined && open.length > 1 && same(last, open[0]) ? open.slice(0, -1) : open;
}

/**
 * The part of a ring inside an axis-aligned box, by Sutherland-Hodgman against each box side.
 * The ring may be concave; the box is convex, so one cut per side is enough. Returns an empty
 * ring when they do not overlap.
 */
export function clipPolygonToBox(polygon: readonly PlanePoint[], box: PlaneBox): PlanePoint[] {
  const clipped = sidesOf(box).reduce<PlanePoint[]>(
    (ring, side) => (ring.length === 0 ? ring : clipToSide(ring, side)),
    [...polygon],
  );
  const ring = withoutRepeats(clipped);
  return ring.length < MIN_RING_POINTS ? [] : ring;
}

/** Shoelace area of any ring of plane points; the winding order does not matter. */
export function ringArea(ring: readonly PlanePoint[]): number {
  let twiceSigned = 0;
  ring.forEach((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    twiceSigned += from.x * to.y - to.x * from.y;
  });
  return Math.abs(twiceSigned) * HALF;
}
