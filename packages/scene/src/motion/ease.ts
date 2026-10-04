import { CURVES, type CubicCurve, type CurveName } from './tokens.js';

const NEWTON_STEPS = 8;
const BISECT_STEPS = 24;
const SLOPE_FLOOR = 1e-6;
const CUBIC = 3;

/** One coordinate of the bezier through (0,0), (a,·), (b,·), (1,1) at parameter t. */
function bezierAt(t: number, a: number, b: number): number {
  const u = 1 - t;
  return CUBIC * u * u * t * a + CUBIC * u * t * t * b + t * t * t;
}

function slopeAt(t: number, a: number, b: number): number {
  const u = 1 - t;
  return CUBIC * u * u * a + (CUBIC + CUBIC) * u * t * (b - a) + CUBIC * t * t * (1 - b);
}

/** The bezier parameter whose x equals the given progress: Newton first, bisection to finish. */
function parameterFor(x: number, curve: CubicCurve): number {
  let t = x;
  for (let step = 0; step < NEWTON_STEPS; step += 1) {
    const slope = slopeAt(t, curve.x1, curve.x2);
    if (Math.abs(slope) < SLOPE_FLOOR) break;
    t -= (bezierAt(t, curve.x1, curve.x2) - x) / slope;
  }
  if (t >= 0 && t <= 1 && Math.abs(bezierAt(t, curve.x1, curve.x2) - x) < SLOPE_FLOOR) return t;
  let low = 0;
  let high = 1;
  for (let step = 0; step < BISECT_STEPS; step += 1) {
    t = (low + high) / (1 + 1);
    if (bezierAt(t, curve.x1, curve.x2) < x) low = t;
    else high = t;
  }
  return t;
}

/** Eased value of a 0 to 1 progress on a named curve, the same curve CSS draws. */
export function eased(name: CurveName, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const curve = CURVES[name];
  const value = bezierAt(parameterFor(progress, curve), curve.y1, curve.y2);
  return Math.min(Math.max(value, 0), 1);
}
