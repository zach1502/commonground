import type { SceneBounds } from '../geometry/sample.js';
import { ISLAND_SKIRT_DEPTH_M } from '../geometry/terrain-mesh.js';
import type { GroundPoint, Vector3 } from '../types.js';

import { FIELD_OF_VIEW_DEG, type CameraPose } from './presets.js';

/** DESIGN.md "Camera": the nearest the camera comes to the point it orbits. */
export const MIN_ORBIT_DISTANCE_M = 4;
/** The camera stays this far above the ground under it. */
export const GROUND_CLEARANCE_M = 1;
/** The farthest zoom, as a multiple of the distance that fits the parcel's bounding sphere. */
const FAR_REACH = 1.5;
const HALF = 0.5;
const STRAIGHT_ANGLE_DEG = 180;
const DEG_TO_RAD = Math.PI / STRAIGHT_ANGLE_DEG;
/**
 * How far the orbit target may sit above or below the ground's range, as a share of the parcel's
 * longer side. The presets aim off the ground so the parcel sits centred on screen.
 */
const TARGET_SLACK = 0.25;
/**
 * How far below the ground the orbit target may sit, as a share of the camera distance. The
 * presets aim a little under the ground to centre the parcel; up close the target sits on it.
 */
const TARGET_DIP = 0.1;
// A change smaller than this is rounding, not a correction.
const EPSILON_M = 1e-6;

export interface OrbitLimits {
  readonly minDistanceM: number;
  readonly maxDistanceM: number;
  readonly clearanceM: number;
  /** The orbit target stays in the island's box, so a pan or zoom cannot lose the park. */
  readonly targetBox: SceneBounds;
}

export type GroundHeight = (point: GroundPoint) => number;

const lengthOf = (v: Vector3) => Math.hypot(v.x, v.y, v.z);
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

function targetBoxOf(bounds: SceneBounds): SceneBounds {
  const slack = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * TARGET_SLACK;
  return {
    ...bounds,
    minY: bounds.minY - ISLAND_SKIRT_DEPTH_M - slack,
    maxY: bounds.maxY + slack,
  };
}

/**
 * The distance at which the parcel's bounding sphere fits the vertical field of view, times 1.5.
 * On a square canvas the horizontal field of view is the same angle and on a wider one it is
 * wider, so the vertical one is the tighter. The canvas aspect plays no part, so the limit stays
 * put when the window or a side column changes size. The 1.5 margin keeps the sphere inside the
 * horizontal view down to an aspect of about 0.64, narrower than any editor canvas.
 */
function farDistanceM(bounds: SceneBounds): number {
  const radius =
    lengthOf({
      x: bounds.maxX - bounds.minX,
      y: bounds.maxY - bounds.minY,
      z: bounds.maxZ - bounds.minZ,
    }) * HALF;
  return (radius / Math.sin(FIELD_OF_VIEW_DEG * HALF * DEG_TO_RAD)) * FAR_REACH;
}

/** Zoom limits for a parcel: 4 m in, and out to 1.5 times the parcel's bounding sphere fit. */
export function orbitLimitsFor(bounds: SceneBounds): OrbitLimits {
  return {
    minDistanceM: MIN_ORBIT_DISTANCE_M,
    maxDistanceM: farDistanceM(bounds),
    clearanceM: GROUND_CLEARANCE_M,
    targetBox: targetBoxOf(bounds),
  };
}

function clampTarget(target: Vector3, box: SceneBounds): Vector3 {
  return {
    x: clamp(target.x, box.minX, box.maxX),
    y: clamp(target.y, box.minY, box.maxY),
    z: clamp(target.z, box.minZ, box.maxZ),
  };
}

function clampDistance(position: Vector3, target: Vector3, limits: OrbitLimits): Vector3 {
  const offset = { x: position.x - target.x, y: position.y - target.y, z: position.z - target.z };
  const distance = lengthOf(offset);
  if (distance === 0) return { x: target.x, y: target.y + limits.minDistanceM, z: target.z };
  const scale = clamp(distance, limits.minDistanceM, limits.maxDistanceM) / distance;
  return {
    x: target.x + offset.x * scale,
    y: target.y + offset.y * scale,
    z: target.z + offset.z * scale,
  };
}

/** How far to raise the target, and the camera with it, so the target is not deep underground. */
function targetLift(target: Vector3, position: Vector3, groundAt: GroundHeight): number {
  const distance = lengthOf({
    x: position.x - target.x,
    y: position.y - target.y,
    z: position.z - target.z,
  });
  const lowest = groundAt({ x: target.x, z: target.z }) - distance * TARGET_DIP;
  return Math.max(lowest - target.y, 0);
}

function moved(a: Vector3, b: Vector3): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > EPSILON_M;
}

/**
 * The pose pulled back inside the limits: the target in the island box, the camera between the
 * nearest and farthest zoom, and above the ground. Returns null when the pose is already inside.
 */
export function clampOrbit(
  pose: CameraPose,
  limits: OrbitLimits,
  groundAt: GroundHeight,
): CameraPose | null {
  const boxed = clampTarget(pose.target, limits.targetBox);
  const spacedFirst = clampDistance(pose.position, boxed, limits);
  const lift = targetLift(boxed, spacedFirst, groundAt);
  const target = { ...boxed, y: boxed.y + lift };
  const spaced = { ...spacedFirst, y: spacedFirst.y + lift };
  const floor = groundAt({ x: spaced.x, z: spaced.z }) + limits.clearanceM;
  const position = { ...spaced, y: Math.max(spaced.y, floor) };
  if (!moved(target, pose.target) && !moved(position, pose.position)) return null;
  return { position, target };
}
