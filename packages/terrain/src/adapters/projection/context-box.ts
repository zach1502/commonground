import proj4 from 'proj4';

import type { PlanePoint } from '@parkshape/core';

import type { GeoJsonPolygon, LonLat } from '../../geojson.js';

import type { LocalFrame } from './local-frame.js';

/** An axis-aligned box in a parcel's local frame, in metres. */
export interface LocalBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface PolylineFoot {
  readonly point: PlanePoint;
  readonly distance: number;
  /** Unit vector along the nearest segment, in the direction the line runs. */
  readonly direction: PlanePoint;
}

// Context coordinates are kept to the centimetre, which keeps the fixture small.
const CENTIMETRES_PER_METRE = 100;
// Float noise allowed when a clipped point lands on the box edge.
const EDGE_EPSILON = 1e-9;

export function roundedPoint(point: PlanePoint): PlanePoint {
  const round = (value: number) =>
    Math.round(value * CENTIMETRES_PER_METRE) / CENTIMETRES_PER_METRE;
  return { x: round(point.x), y: round(point.y) };
}

/** A line rounded to the centimetre, without the repeated points rounding can leave. */
export function roundedLine(points: readonly PlanePoint[]): PlanePoint[] {
  return points.map(roundedPoint).filter((point, index, all) => {
    const previous = all[index - 1];
    return previous?.x !== point.x || previous.y !== point.y;
  });
}

export function bufferedParcelBox(ring: readonly PlanePoint[], bufferM: number): LocalBox {
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  return {
    minX: Math.min(...xs) - bufferM,
    minY: Math.min(...ys) - bufferM,
    maxX: Math.max(...xs) + bufferM,
    maxY: Math.max(...ys) + bufferM,
  };
}

export function boxContains(box: LocalBox, point: PlanePoint): boolean {
  return (
    point.x >= box.minX - EDGE_EPSILON &&
    point.x <= box.maxX + EDGE_EPSILON &&
    point.y >= box.minY - EDGE_EPSILON &&
    point.y <= box.maxY + EDGE_EPSILON
  );
}

/** The box corners in WGS84 as a closed ring, for a source query that filters by area. */
export function boxRingWgs84(frame: LocalFrame, box: LocalBox): LonLat[] {
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
    { x: box.minX, y: box.minY },
  ];
  return corners.map((corner) => frame.toWgs84(corner));
}

/** Liang-Barsky: the part of one segment inside the box, as start and end fractions. */
function clipSegment(
  from: PlanePoint,
  to: PlanePoint,
  box: LocalBox,
): [number, number] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const tests: [number, number][] = [
    [-dx, from.x - box.minX],
    [dx, box.maxX - from.x],
    [-dy, from.y - box.minY],
    [dy, box.maxY - from.y],
  ];
  let start = 0;
  let end = 1;
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
  }
  return start <= end ? [start, end] : undefined;
}

const lerp = (from: PlanePoint, to: PlanePoint, t: number): PlanePoint => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const samePoint = (left: PlanePoint | undefined, right: PlanePoint) =>
  left?.x === right.x && left.y === right.y;

/** The pieces of a polyline inside the box. A line that leaves and comes back gives two. */
export function clipPolyline(points: readonly PlanePoint[], box: LocalBox): PlanePoint[][] {
  const pieces: PlanePoint[][] = [];
  let current: PlanePoint[] = [];
  const close = () => {
    if (current.length > 1) pieces.push(current);
    current = [];
  };
  points.slice(1).forEach((to, index) => {
    const from = points[index] ?? to;
    const span = clipSegment(from, to, box);
    if (span === undefined) {
      close();
      return;
    }
    const start = lerp(from, to, span[0]);
    if (!samePoint(current.at(-1), start)) {
      close();
      current.push(start);
    }
    current.push(lerp(from, to, span[1]));
    if (span[1] < 1) close();
  });
  close();
  return pieces;
}

function footOnSegment(point: PlanePoint, from: PlanePoint, to: PlanePoint): PolylineFoot {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return {
      point: from,
      distance: Math.hypot(point.x - from.x, point.y - from.y),
      direction: { x: 1, y: 0 },
    };
  }
  const t = Math.min(
    1,
    Math.max(0, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (length * length)),
  );
  const foot = lerp(from, to, t);
  return {
    point: foot,
    distance: Math.hypot(point.x - foot.x, point.y - foot.y),
    direction: { x: dx / length, y: dy / length },
  };
}

/** The closest point of a polyline to a point, or undefined for a line with no segment. */
export function nearestOnPolyline(
  point: PlanePoint,
  points: readonly PlanePoint[],
): PolylineFoot | undefined {
  let best: PolylineFoot | undefined;
  points.slice(1).forEach((to, index) => {
    const foot = footOnSegment(point, points[index] ?? to, to);
    if (best === undefined || foot.distance < best.distance) best = foot;
  });
  return best;
}

function tmercAt(origin: { readonly lat: number; readonly lon: number }): string {
  return `+proj=tmerc +lat_0=${String(origin.lat)} +lon_0=${String(origin.lon)} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
}

/**
 * A stored parcel's outline back in WGS84. Projects keep the local ring and the WGS84 position
 * of (0, 0), so this inverts a transverse Mercator centred there. The frame it gives matches the
 * stored one to well under a centimetre on a park-sized parcel.
 */
export function parcelPolygonWgs84(parcel: {
  readonly polygon: readonly PlanePoint[];
  readonly origin: { readonly lat: number; readonly lon: number };
}): GeoJsonPolygon {
  const converter = proj4('EPSG:4326', tmercAt(parcel.origin));
  const ring = parcel.polygon.map((point): LonLat => {
    const [lon = 0, lat = 0] = converter.inverse([point.x, point.y]);
    return [lon, lat];
  });
  const [first] = ring;
  return { type: 'Polygon', coordinates: [first === undefined ? ring : [...ring, first]] };
}
