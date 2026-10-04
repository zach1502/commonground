import { centreOf } from '../geometry/sample.js';
import type { SceneBounds } from '../geometry/sample.js';
import type { Vector3 } from '../types.js';

/** DESIGN.md "Framing": the parcel sits inside an 8 percent margin on every side. */
export const FRAME_MARGIN = 0.08;

const HALF = 0.5;
const STRAIGHT_ANGLE_DEG = 180;
const DEG_TO_RAD = Math.PI / STRAIGHT_ANGLE_DEG;
const BISECT_STEPS = 40;
// Start the search well outside any parcel so the far end always fits.
const FAR_FACTOR = 20;
const WORLD_UP: Vector3 = { x: 0, y: 1, z: 0 };

export interface Lens {
  readonly fovDeg: number;
  readonly aspect: number;
}

export interface Pose {
  readonly position: Vector3;
  readonly target: Vector3;
}

const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
function unit(v: Vector3): Vector3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** The 8 corners of the box, so the fit holds for the island's top and its skirt. */
export function boxCorners(bounds: SceneBounds): Vector3[] {
  const xs = [bounds.minX, bounds.maxX];
  const ys = [bounds.minY, bounds.maxY];
  const zs = [bounds.minZ, bounds.maxZ];
  return xs.flatMap((x) => ys.flatMap((y) => zs.map((z) => ({ x, y, z }))));
}

/** Normalised screen position, -1 to 1 on each axis, of a point seen from a pose. */
export function projectToScreen(point: Vector3, pose: Pose, lens: Lens): { x: number; y: number } {
  const forward = unit(sub(pose.target, pose.position));
  const right = unit(cross(forward, WORLD_UP));
  const up = cross(right, forward);
  const offset = sub(point, pose.position);
  const depth = dot(offset, forward);
  const tan = Math.tan(lens.fovDeg * DEG_TO_RAD * HALF);
  return {
    x: dot(offset, right) / (depth * tan * lens.aspect),
    y: dot(offset, up) / (depth * tan),
  };
}

/**
 * DESIGN.md "Framing": the park spans 70 to 78 percent of the canvas axis that binds first. On a
 * wide canvas that is the height, so the whole park stays on screen.
 */
export const FRAME_FILL = { min: 0.7, max: 0.78 } as const;
// A few passes are enough: each one moves the box centre to within a fraction of a pixel.
const CENTRE_PASSES = 4;

/** The box's projected edges in normalised screen units, -1 to 1 on each axis. */
export interface ScreenExtent {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export function screenExtent(bounds: SceneBounds, pose: Pose, lens: Lens): ScreenExtent {
  const points = boxCorners(bounds).map((corner) => projectToScreen(corner, pose, lens));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

const add = (a: Vector3, b: Vector3, scale: number): Vector3 => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  z: a.z + b.z * scale,
});

/** Slides the camera and its target sideways and up until the box sits in the screen centre. */
function centred(bounds: SceneBounds, pose: Pose, lens: Lens): Pose {
  let current = pose;
  const tan = Math.tan(lens.fovDeg * DEG_TO_RAD * HALF);
  const forward = unit(sub(pose.target, pose.position));
  const right = unit(cross(forward, WORLD_UP));
  const up = cross(right, forward);
  const toTarget = sub(pose.target, pose.position);
  const depth = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
  for (let pass = 0; pass < CENTRE_PASSES; pass += 1) {
    const extent = screenExtent(bounds, current, lens);
    const shift = add(
      { x: 0, y: 0, z: 0 },
      right,
      (extent.left + extent.right) * HALF * depth * tan * lens.aspect,
    );
    const move = add(shift, up, (extent.bottom + extent.top) * HALF * depth * tan);
    current = { position: add(current.position, move, 1), target: add(current.target, move, 1) };
  }
  return current;
}

function poseAt(bounds: SceneBounds, direction: Vector3, distance: number, lens: Lens): Pose {
  const target = centreOf(bounds);
  return centred(bounds, { target, position: add(target, direction, distance) }, lens);
}

type FrameTest = (extent: ScreenExtent) => boolean;

/** The nearest distance at which the test passes. Bisection, as the corners move non-linearly. */
function nearestPassing(bounds: SceneBounds, direction: Vector3, lens: Lens, test: FrameTest) {
  const span = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
  );
  let near = 0;
  let far = span * FAR_FACTOR;
  for (let step = 0; step < BISECT_STEPS; step += 1) {
    const middle = (near + far) * HALF;
    const pose = poseAt(bounds, direction, middle, lens);
    if (test(screenExtent(bounds, pose, lens))) far = middle;
    else near = middle;
  }
  return far;
}

/** The larger of the box's width and height, each as a share of that canvas axis. */
const bindingShare = (extent: ScreenExtent): number =>
  Math.max(extent.right - extent.left, extent.top - extent.bottom) * HALF;

/**
 * Framing along a unit direction for the canvas's real aspect: the box centred, every corner
 * inside the margin, and the axis that binds first (the height on a wide canvas, the width on a
 * tall one) filled to 78 percent. Nothing is cropped.
 */
export function fitPose(bounds: SceneBounds, direction: Vector3, lens: Lens): Pose {
  const limit = 1 - FRAME_MARGIN;
  const inFrame = (extent: ScreenExtent) =>
    bindingShare(extent) <= FRAME_FILL.max &&
    Math.max(-extent.left, extent.right, extent.top, -extent.bottom) <= limit;
  return poseAt(bounds, direction, nearestPassing(bounds, direction, lens, inFrame), lens);
}
