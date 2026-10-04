import type { GroundPoint } from '../types.js';

type StepAt = (point: GroundPoint) => number;

function lerp(from: GroundPoint, to: GroundPoint, t: number): GroundPoint {
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

/** Adds points along each segment, no further apart than the step the ground asks for there. */
export function densify(points: readonly GroundPoint[], stepAt: StepAt): GroundPoint[] {
  const [first] = points;
  if (first === undefined) return [];
  const out: GroundPoint[] = [first];
  points.slice(1).forEach((to, index) => {
    const from = points[index] ?? to;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    let along = 0;
    while (length - along > stepAt(lerp(from, to, along / length))) {
      along += stepAt(lerp(from, to, along / length));
      out.push(lerp(from, to, along / length));
    }
    out.push(to);
  });
  return out;
}

interface Walk {
  readonly points: readonly GroundPoint[];
  /** Distance from the start to each point. */
  readonly at: readonly number[];
}

function walkOf(points: readonly GroundPoint[]): Walk {
  const at = points.reduce<number[]>((sums, point, index) => {
    const previous = points[index - 1];
    const last = sums.at(-1) ?? 0;
    return [
      ...sums,
      previous === undefined ? 0 : last + Math.hypot(point.x - previous.x, point.z - previous.z),
    ];
  }, []);
  return { points, at };
}

function pointAt(walk: Walk, distance: number): GroundPoint {
  const next = walk.at.findIndex((value) => value >= distance);
  const to = walk.points[next] ?? walk.points.at(-1) ?? { x: 0, z: 0 };
  const from = walk.points[next - 1] ?? to;
  const start = walk.at[next - 1] ?? 0;
  const span = (walk.at[next] ?? start) - start;
  return span === 0 ? to : lerp(from, to, (distance - start) / span);
}

/** One dash from start to end along the line, keeping any corners inside it. */
function dashOf(walk: Walk, start: number, end: number): GroundPoint[] {
  const corners = walk.points.filter((_, index) => {
    const distance = walk.at[index] ?? 0;
    return distance > start && distance < end;
  });
  return [pointAt(walk, start), ...corners, pointAt(walk, end)];
}

/** Splits a line into dashes of dashM with gaps of the same length. */
export function dashesOf(points: readonly GroundPoint[], dashM: number): GroundPoint[][] {
  const walk = walkOf(points);
  const total = walk.at.at(-1) ?? 0;
  const dashes: GroundPoint[][] = [];
  for (let start = 0; start + dashM <= total; start += dashM + dashM) {
    dashes.push(dashOf(walk, start, start + dashM));
  }
  return dashes;
}
