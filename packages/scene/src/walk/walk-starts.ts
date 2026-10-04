import type { GroundPoint, ParkDocument } from '../types.js';

// Plan section 5 names 2 m; the seeded paths end 3 to 4 m inside the fence, so 4 m finds them.
const ENTRANCE_REACH_M = 4;
// Path ends closer than this are one entrance, such as a loop that starts where it ends.
const SAME_ENTRANCE_M = 3;
// An edge start stands this far inside the boundary, so the first step is not refused.
const EDGE_INSET_M = 1;
const MIN_STARTS = 2;

export interface WalkStart {
  readonly position: GroundPoint;
  readonly headingRad: number;
  /** 'entrance' is a path end at the edge; 'edge' is the boundary point nearest the view. */
  readonly kind: 'entrance' | 'edge';
}

export interface WalkStartsInput {
  readonly document: ParkDocument;
  readonly parcel: readonly GroundPoint[];
  /** Where the overview camera aims, so the first start is the one nearest the view. */
  readonly near: GroundPoint;
}

interface EdgePoint {
  readonly point: GroundPoint;
  readonly distance: number;
  readonly inward: GroundPoint;
}

const distanceBetween = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);

function centroidOf(parcel: readonly GroundPoint[]): GroundPoint {
  const total = parcel.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), {
    x: 0,
    z: 0,
  });
  return { x: total.x / parcel.length, z: total.z / parcel.length };
}

/** The nearest point on one edge, and the edge's normal turned toward the parcel's middle. */
function nearestOnEdge(
  from: GroundPoint,
  to: GroundPoint,
  point: GroundPoint,
  middle: GroundPoint,
): EdgePoint {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const t =
    length === 0 ? 0 : ((point.x - from.x) * dx + (point.z - from.z) * dz) / (length * length);
  const along = Math.min(Math.max(t, 0), 1);
  const nearest = { x: from.x + dx * along, z: from.z + dz * along };
  const normal = length === 0 ? { x: 0, z: 0 } : { x: -dz / length, z: dx / length };
  const facesIn = normal.x * (middle.x - nearest.x) + normal.z * (middle.z - nearest.z) >= 0;
  const inward = facesIn ? normal : { x: -normal.x, z: -normal.z };
  return { point: nearest, distance: distanceBetween(nearest, point), inward };
}

function nearestEdge(parcel: readonly GroundPoint[], point: GroundPoint): EdgePoint | undefined {
  const middle = centroidOf(parcel);
  return parcel
    .map((from, index) =>
      nearestOnEdge(from, parcel[(index + 1) % parcel.length] ?? from, point, middle),
    )
    .reduce<EdgePoint | undefined>(
      (best, edge) => (best === undefined || edge.distance < best.distance ? edge : best),
      undefined,
    );
}

function facing(position: GroundPoint, middle: GroundPoint): number {
  return Math.atan2(middle.x - position.x, middle.z - position.z);
}

function pathEnds(document: ParkDocument): GroundPoint[] {
  return document.paths.flatMap((path) => {
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    return [first, last].filter((point): point is GroundPoint => point !== undefined);
  });
}

function withoutRepeats(points: readonly GroundPoint[]): GroundPoint[] {
  return points.reduce<GroundPoint[]>(
    (kept, point) =>
      kept.some((other) => distanceBetween(other, point) < SAME_ENTRANCE_M)
        ? kept
        : [...kept, point],
    [],
  );
}

function edgeStart(parcel: readonly GroundPoint[], near: GroundPoint): GroundPoint | undefined {
  const edge = nearestEdge(parcel, near);
  if (edge === undefined) return undefined;
  return {
    x: edge.point.x + edge.inward.x * EDGE_INSET_M,
    z: edge.point.z + edge.inward.z * EDGE_INSET_M,
  };
}

/**
 * Where a walk can start: the path ends at the parcel edge, which are the design's entrances,
 * nearest the view first. With fewer than two, the edge point nearest the view joins them.
 * Each start faces the middle of the parcel.
 */
export function walkStarts({ document, parcel, near }: WalkStartsInput): WalkStart[] {
  const middle = centroidOf(parcel);
  const entrances = withoutRepeats(
    pathEnds(document).filter(
      (point) => (nearestEdge(parcel, point)?.distance ?? Infinity) <= ENTRANCE_REACH_M,
    ),
  );
  const edge = entrances.length < MIN_STARTS ? edgeStart(parcel, near) : undefined;
  const extra =
    edge === undefined || entrances.some((point) => distanceBetween(point, edge) < SAME_ENTRANCE_M)
      ? []
      : [{ position: edge, kind: 'edge' as const }];
  return [...entrances.map((position) => ({ position, kind: 'entrance' as const })), ...extra]
    .sort((a, b) => distanceBetween(a.position, near) - distanceBetween(b.position, near))
    .map((start) => ({ ...start, headingRad: facing(start.position, middle) }));
}
