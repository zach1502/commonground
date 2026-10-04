import { SLOPE_SAMPLE_STEP_M, SLOPE_TOLERANCE } from '../constants.js';
import type { DesignPath } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';
import type { ItemId } from '../schema/ids.js';

import { sampleAt, type Heightmap } from './heightmap.js';

const HALF = 0.5;

export interface SlopeLimits {
  readonly maxRunning: number;
  readonly maxCross: number;
}

export interface PolylineSlopes {
  readonly maxRunning: number;
  readonly maxCross: number;
  /** Indexes of sample segments (between sample k and k + 1) above each limit. */
  readonly runningSegments: readonly number[];
  readonly crossSegments: readonly number[];
}

export interface PathSlopes extends PolylineSlopes {
  readonly pathId: ItemId;
  /** 1-based position in drawing order, as shown to residents. */
  readonly pathNumber: number;
  /** An existing path is measured and reported, but its slopes are not the resident's problem. */
  readonly existing: boolean;
}

interface SegmentSlope {
  readonly running: number;
  readonly cross: number;
}

function pointsAlong(from: PlanePoint, to: PlanePoint, stepM: number): PlanePoint[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return [];
  const count = Math.ceil(length / stepM);
  return Array.from({ length: count }, (_, k) => ({
    x: from.x + ((to.x - from.x) * k) / count,
    y: from.y + ((to.y - from.y) * k) / count,
  }));
}

/** Points no more than stepM apart along the polyline, including both ends. */
export function samplePolyline(points: readonly PlanePoint[], stepM: number): PlanePoint[] {
  const last = points.at(-1);
  const inner = points.slice(1).flatMap((to, index) => pointsAlong(points[index] ?? to, to, stepM));
  return last === undefined ? inner : [...inner, last];
}

/** Running slope from end to end; cross slope across the path width at the midpoint. */
function segmentSlope(heightmap: Heightmap, from: PlanePoint, to: PlanePoint, widthM: number) {
  const halfWidthM = widthM * HALF;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const running = Math.abs(sampleAt(heightmap, to) - sampleAt(heightmap, from)) / length;
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  const middle = { x: (from.x + to.x) * HALF, y: (from.y + to.y) * HALF };
  const left = { x: middle.x + normal.x * halfWidthM, y: middle.y + normal.y * halfWidthM };
  const right = { x: middle.x - normal.x * halfWidthM, y: middle.y - normal.y * halfWidthM };
  const cross = Math.abs(sampleAt(heightmap, left) - sampleAt(heightmap, right)) / widthM;
  return { running, cross };
}

function indexesAbove(values: readonly number[], limit: number): number[] {
  return values.flatMap((value, index) => (value > limit + SLOPE_TOLERANCE ? [index] : []));
}

/** Slopes of a centre line of the given width, sampled as the path check samples a path. */
export function measurePolyline(
  heightmap: Heightmap,
  line: { readonly points: readonly PlanePoint[]; readonly widthM: number },
  limits: SlopeLimits,
): PolylineSlopes {
  const samples = samplePolyline(line.points, SLOPE_SAMPLE_STEP_M);
  const segments: SegmentSlope[] = samples
    .slice(1)
    .map((to, index) => segmentSlope(heightmap, samples[index] ?? to, to, line.widthM));
  const running = segments.map((segment) => segment.running);
  const cross = segments.map((segment) => segment.cross);
  return {
    maxRunning: Math.max(0, ...running),
    maxCross: Math.max(0, ...cross),
    runningSegments: indexesAbove(running, limits.maxRunning),
    crossSegments: indexesAbove(cross, limits.maxCross),
  };
}

/** True when no sample segment of the line is above either limit. */
export function withinSlopeLimits(
  heightmap: Heightmap,
  line: { readonly points: readonly PlanePoint[]; readonly widthM: number },
  limits: SlopeLimits,
): boolean {
  const measured = measurePolyline(heightmap, line, limits);
  return measured.runningSegments.length === 0 && measured.crossSegments.length === 0;
}

/** Per-metre slope samples along every path, checked against the accessible limits. */
export function measurePathSlopes(
  heightmap: Heightmap,
  paths: readonly DesignPath[],
  limits: SlopeLimits,
): PathSlopes[] {
  return paths.map((path, index) => ({
    pathId: path.id,
    pathNumber: index + 1,
    existing: path.existing === true,
    ...measurePolyline(heightmap, path, limits),
  }));
}
