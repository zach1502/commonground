import type { Heightmap } from '@parkshape/core';

import type { GroundPoint, MeshArrays } from '../types.js';

import { itemAt } from './arrays.js';
import { elevationAt } from './sample.js';
import { HALF, VECTOR_SIZE } from './vector-layout.js';

const SIDES = [1, -1] as const;
const INDICES_PER_SEGMENT = 6;
// Caps the widening at sharp turns so a hairpin does not throw a spike.
const MAX_MITER_SCALE = 2;
// Lifts paths just above the ground so the terrain does not show through.
const DEFAULT_LIFT_M = 0.03;

export interface RibbonOptions {
  readonly widthM: number;
  readonly liftM?: number;
}

interface Direction {
  readonly x: number;
  readonly z: number;
}

const EAST: Direction = { x: 1, z: 0 };
// Points closer than this are one point, so no segment has a zero or noise-sized length.
const SAME_POINT_M = 1e-6;
// A closed loop needs three distinct corners plus the point that closes it.
const MIN_LOOP_POINTS = 4;
// Below this the two directions at a point cancel, so the path turns straight back.
const HAIRPIN_BISECTOR = 1e-6;

function direction(from: GroundPoint, to: GroundPoint): Direction | undefined {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  return length === 0 ? undefined : { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
}

function samePoint(a: GroundPoint, b: GroundPoint): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) < SAME_POINT_M;
}

interface PathShape {
  readonly points: readonly GroundPoint[];
  readonly closed: boolean;
}

/** The path without repeated points; a loop ends on exactly its first point. */
function canonicalPath(points: readonly GroundPoint[]): PathShape {
  const distinct = points.reduce<GroundPoint[]>((kept, point) => {
    const last = kept.at(-1);
    return last !== undefined && samePoint(last, point) ? kept : [...kept, point];
  }, []);
  const first = distinct[0];
  const last = distinct.at(-1);
  if (first === undefined || last === undefined || distinct.length < MIN_LOOP_POINTS) {
    return { points: distinct, closed: false };
  }
  if (!samePoint(first, last)) return { points: distinct, closed: false };
  return { points: [...distinct.slice(0, -1), first], closed: true };
}

function previousIndex(path: PathShape, index: number): number | undefined {
  if (index > 0) return index - 1;
  // The closing point equals the first, so the first point's neighbour is the one before it.
  return path.closed ? path.points.length - 1 - 1 : undefined;
}

function nextIndex(path: PathShape, index: number): number | undefined {
  if (index < path.points.length - 1) return index + 1;
  return path.closed ? 1 : undefined;
}

/** On a loop the neighbours wrap past the closing point, so the seam gets a corner like any other. */
function neighbourDirections(
  path: PathShape,
  index: number,
): { incoming?: Direction | undefined; outgoing?: Direction | undefined } {
  const { points } = path;
  const point = itemAt(points, index);
  const previous = previousIndex(path, index);
  const next = nextIndex(path, index);
  return {
    incoming: previous === undefined ? undefined : direction(itemAt(points, previous), point),
    outgoing: next === undefined ? undefined : direction(point, itemAt(points, next)),
  };
}

/** Left-hand offset at one path point, widened at corners so the ribbon keeps its width. */
function offsetAt(path: PathShape, index: number): Direction {
  const { incoming, outgoing } = neighbourDirections(path, index);
  const along = incoming ?? outgoing ?? EAST;
  const before = incoming ?? along;
  const after = outgoing ?? along;
  const bisector = { x: before.x + after.x, z: before.z + after.z };
  const bisectorLength = Math.hypot(bisector.x, bisector.z);
  if (bisectorLength < HAIRPIN_BISECTOR) return { x: -along.z, z: along.x };
  const tangent = { x: bisector.x / bisectorLength, z: bisector.z / bisectorLength };
  const cosine = tangent.x * along.x + tangent.z * along.z;
  const miter = 1 / Math.max(cosine, 1 / MAX_MITER_SCALE);
  return { x: -tangent.z * miter, z: tangent.x * miter };
}

function emptyMesh(): MeshArrays {
  return { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
}

/** Ground height under a point, such as the terrain or the apron around it. */
export type RibbonGround = (point: GroundPoint) => number;

/** Triangle strip of the given width along a path, draped on the terrain. */
export function buildRibbon(
  heightmap: Heightmap,
  rawPoints: readonly GroundPoint[],
  options: RibbonOptions,
): MeshArrays {
  return buildRibbonOn((point) => elevationAt(heightmap, point), rawPoints, options);
}

/** Triangle strip of the given width along a path, draped on any ground. */
export function buildRibbonOn(
  ground: RibbonGround,
  rawPoints: readonly GroundPoint[],
  options: RibbonOptions,
): MeshArrays {
  const path = canonicalPath(rawPoints);
  const { points } = path;
  if (points.length <= 1) {
    return emptyMesh();
  }
  const halfWidth = options.widthM * HALF;
  const lift = options.liftM ?? DEFAULT_LIFT_M;
  const positions = new Float32Array(points.length * SIDES.length * VECTOR_SIZE);
  const normals = new Float32Array(positions.length);
  points.forEach((point, index) => {
    const offset = offsetAt(path, index);
    SIDES.forEach((side, sideIndex) => {
      const at = {
        x: point.x + side * offset.x * halfWidth,
        z: point.z + side * offset.z * halfWidth,
      };
      const vertex = (index * SIDES.length + sideIndex) * VECTOR_SIZE;
      positions.set([at.x, ground(at) + lift, at.z], vertex);
      normals.set([0, 1, 0], vertex);
    });
  });
  const indices = new Uint32Array((points.length - 1) * INDICES_PER_SEGMENT);
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const left = segment * SIDES.length;
    const right = left + 1;
    const nextLeft = left + SIDES.length;
    const nextRight = nextLeft + 1;
    indices.set([left, nextLeft, right, right, nextLeft, nextRight], segment * INDICES_PER_SEGMENT);
  }
  return { positions, normals, indices };
}
