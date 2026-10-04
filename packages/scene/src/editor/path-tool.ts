import { DEFAULT_MAX_RUNNING_SLOPE, type PlanePoint } from '@parkshape/core';

import type { Status } from '../palette/colours.js';

/** Curve points drawn between two control points of a path. */
export const CURVE_SAMPLES_PER_SPAN = 6;
/** DESIGN.md: path grade is amber from 5 to 8 percent and red above 8. */
export const AMBER_GRADE_LIMIT = 0.08;
/** A click this close to the last point is the second click of a double-click, not a new point. */
export const DUPLICATE_POINT_M = 0.05;
const HALF = 0.5;
const MIN_PATH_POINTS = 2;

const midpoint = (a: PlanePoint, b: PlanePoint) => ({
  x: (a.x + b.x) * HALF,
  y: (a.y + b.y) * HALF,
});

// Cubic Hermite basis weights; Catmull-Rom uses half the neighbour gap as each tangent.
const TWO = 2;
const THREE = 3;

type Span = readonly [PlanePoint, PlanePoint, PlanePoint, PlanePoint];

function catmullRomAt([p0, p1, p2, p3]: Span, t: number): PlanePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const startWeight = TWO * t3 - THREE * t2 + 1;
  const startTangent = t3 - TWO * t2 + t;
  const endWeight = -TWO * t3 + THREE * t2;
  const endTangent = t3 - t2;
  const axis = (a: number, b: number, c: number, d: number) =>
    startWeight * b + startTangent * (c - a) * HALF + endWeight * c + endTangent * (d - b) * HALF;
  return { x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y) };
}

/** A smooth curve through every control point, with samplesPerSpan steps between each pair. */
export function catmullRom(points: readonly PlanePoint[], samplesPerSpan: number): PlanePoint[] {
  const [first] = points;
  if (first === undefined || points.length < MIN_PATH_POINTS) return [...points];
  const curve: PlanePoint[] = [first];
  for (let span = 0; span + 1 < points.length; span += 1) {
    const p1 = points[span] ?? first;
    const p2 = points[span + 1] ?? p1;
    const p0 = points[span - 1] ?? p1;
    const p3 = points[span + TWO] ?? p2;
    for (let step = 1; step <= samplesPerSpan; step += 1) {
      curve.push(
        step === samplesPerSpan ? p2 : catmullRomAt([p0, p1, p2, p3], step / samplesPerSpan),
      );
    }
  }
  return curve;
}

export function segmentMidpoints(points: readonly PlanePoint[]): PlanePoint[] {
  return points.slice(1).map((to, index) => midpoint(points[index] ?? to, to));
}

/** Adds a vertex halfway along segment segmentIndex, which runs from point i to point i + 1. */
export function insertMidpoint(points: readonly PlanePoint[], segmentIndex: number): PlanePoint[] {
  const from = points[segmentIndex];
  const to = points[segmentIndex + 1];
  if (from === undefined || to === undefined) return [...points];
  return [
    ...points.slice(0, segmentIndex + 1),
    midpoint(from, to),
    ...points.slice(segmentIndex + 1),
  ];
}

export function appendPoint(points: readonly PlanePoint[], point: PlanePoint): PlanePoint[] {
  const last = points.at(-1);
  if (last !== undefined && Math.hypot(last.x - point.x, last.y - point.y) < DUPLICATE_POINT_M) {
    return [...points];
  }
  return [...points, point];
}

export function removeLastPoint(points: readonly PlanePoint[]): PlanePoint[] {
  return points.slice(0, -1);
}

export type FinishedPath =
  | { readonly kind: 'finished'; readonly points: readonly PlanePoint[] }
  | { readonly kind: 'too-short' };

export function finishPath(points: readonly PlanePoint[]): FinishedPath {
  return points.length >= MIN_PATH_POINTS ? { kind: 'finished', points } : { kind: 'too-short' };
}

export function gradeStatus(grade: number): Extract<Status, 'success' | 'warning' | 'danger'> {
  if (grade <= DEFAULT_MAX_RUNNING_SLOPE) return 'success';
  return grade <= AMBER_GRADE_LIMIT ? 'warning' : 'danger';
}

/** Rise over run of each segment. */
export function segmentGrades(
  points: readonly PlanePoint[],
  elevationAt: (point: PlanePoint) => number,
): number[] {
  return points.slice(1).map((to, index) => {
    const from = points[index] ?? to;
    const run = Math.hypot(to.x - from.x, to.y - from.y);
    return run === 0 ? 0 : Math.abs(elevationAt(to) - elevationAt(from)) / run;
  });
}
