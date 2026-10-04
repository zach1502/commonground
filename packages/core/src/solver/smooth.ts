import type { PlanePoint } from '../schema/geometry.js';

// Catmull-Rom basis weights for a uniform spline with tension 0.5.
const HALF = 0.5;
const TWO = 2;
const THREE = 3;
const FOUR = 4;
const FIVE = 5;
const COLLINEAR_TOLERANCE = 1e-9;

type Four = readonly [number, number, number, number];

function blend([p0, p1, p2, p3]: Four, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    HALF *
    (TWO * p1 +
      (-p0 + p2) * t +
      (TWO * p0 - FIVE * p1 + FOUR * p2 - p3) * t2 +
      (-p0 + THREE * p1 - THREE * p2 + p3) * t3)
  );
}

/** A curve through every control point, with the given number of samples per span. */
export function catmullRom(controls: readonly PlanePoint[], samplesPerSpan: number): PlanePoint[] {
  const first = controls[0];
  const last = controls.at(-1);
  if (first === undefined || last === undefined) return [];
  const padded = [first, ...controls, last];
  const curve: PlanePoint[] = [];
  for (let span = 0; span + 1 < controls.length; span += 1) {
    const [p0, p1, p2, p3] = [
      padded[span],
      padded[span + 1],
      padded[span + TWO],
      padded[span + THREE],
    ];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    for (let k = 0; k < samplesPerSpan; k += 1) {
      const t = k / samplesPerSpan;
      curve.push({ x: blend([p0.x, p1.x, p2.x, p3.x], t), y: blend([p0.y, p1.y, p2.y, p3.y], t) });
    }
  }
  curve.push(last);
  return curve;
}

/** The first value, every nth after it, and the last. */
export function everyNth<T>(values: readonly T[], stride: number): T[] {
  const kept = values.filter((_, index) => index % stride === 0);
  const last = values.at(-1);
  return last === undefined || kept.at(-1) === last ? kept : [...kept, last];
}

/** True when the point is on the segment between its neighbours, not at the tip of a turn back. */
function between(before: PlanePoint, point: PlanePoint, after: PlanePoint): boolean {
  const cross =
    (point.x - before.x) * (after.y - before.y) - (point.y - before.y) * (after.x - before.x);
  const onward =
    (point.x - before.x) * (after.x - point.x) + (point.y - before.y) * (after.y - point.y);
  return Math.abs(cross) <= COLLINEAR_TOLERANCE && onward > 0;
}

/** Drops points that lie on the straight line between their neighbours. */
export function withoutCollinear(points: readonly PlanePoint[]): PlanePoint[] {
  return points.filter((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    return before === undefined || after === undefined || !between(before, point, after);
  });
}

function samePoint(a: PlanePoint, b: PlanePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Drops each point equal to the one before it, so no segment has zero length. */
export function withoutRepeats(points: readonly PlanePoint[]): PlanePoint[] {
  return points.filter((point, index) => {
    const before = points[index - 1];
    return before === undefined || !samePoint(before, point);
  });
}
