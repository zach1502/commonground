import { clamp, polygonContains, type Heightmap } from '@parkshape/core';

import { elevationAt } from '../geometry/sample.js';
import type { GroundPoint, Vector3 } from '../types.js';

/** DESIGN.md "Walk": the eye sits 1.6 m above the ground under it. */
export const EYE_HEIGHT_M = 1.6;
const WALK_SPEED_M_PER_S = 1.4;
// Running is 25 percent faster than the first 2.5x, at the owner's request.
const RUN_FACTOR = 3.125;
const STRAIGHT_ANGLE_DEG = 180;
const radians = (degrees: number) => (degrees * Math.PI) / STRAIGHT_ANGLE_DEG;
const TURN_DEG_PER_S = 90;
const TURN_RAD_PER_S = radians(TURN_DEG_PER_S);
const PITCH_LIMIT_DEG = 30;
const PITCH_LIMIT_RAD = radians(PITCH_LIMIT_DEG);
// A frame longer than this is a stalled tab; the walker takes one short step instead.
const MAX_STEP_S = 0.1;
// Reduced motion: one press moves 4 m or turns 45 degrees, with nothing in between.
const REDUCED_STEP_M = 4;
const REDUCED_TURN_DEG = 45;
const REDUCED_TURN_RAD = radians(REDUCED_TURN_DEG);
// A tapped point counts as reached inside this distance.
const ARRIVE_M = 0.05;
// The tap ray marches in steps this long, out to the far edge of a large park.
const RAY_STEP_M = 0.5;
const RAY_REACH_M = 400;
const RAY_REFINE_STEPS = 12;
const HALF = 0.5;

export interface WalkerState {
  readonly position: GroundPoint;
  /** Direction of travel; 0 faces +z and a positive turn goes to the left. */
  readonly headingRad: number;
  /** Look angle above the horizon. */
  readonly pitchRad: number;
}

export type Axis = -1 | 0 | 1;

export interface WalkInput {
  readonly forward: Axis;
  readonly strafe: Axis;
  /** 1 turns left, -1 turns right. */
  readonly turn: Axis;
  readonly pace: 'walk' | 'run';
}

export interface WalkWorld {
  readonly heightmap: Heightmap;
  /** The parcel boundary in the scene's ground frame. */
  readonly parcel: readonly GroundPoint[];
}

export type WalkStep = 'forward' | 'back' | 'step-left' | 'step-right' | 'turn-left' | 'turn-right';

function inside(world: WalkWorld, point: GroundPoint): boolean {
  return polygonContains(
    world.parcel.map((corner) => ({ x: corner.x, y: corner.z })),
    { x: point.x, y: point.z },
  );
}

/**
 * Moves by an offset if the end stays inside the parcel. Otherwise it keeps one axis of the
 * offset, so walking into the edge slides along it, or it stays put.
 */
function moveInside(world: WalkWorld, from: GroundPoint, offset: GroundPoint): GroundPoint {
  const candidates = [
    { x: from.x + offset.x, z: from.z + offset.z },
    { x: from.x + offset.x, z: from.z },
    { x: from.x, z: from.z + offset.z },
  ];
  return candidates.find((point) => inside(world, point)) ?? from;
}

/** The ground offset for a forward and sideways amount at a heading. Right is -x at heading 0. */
function offsetFor(headingRad: number, forwardM: number, rightM: number): GroundPoint {
  const sin = Math.sin(headingRad);
  const cos = Math.cos(headingRad);
  return { x: sin * forwardM - cos * rightM, z: cos * forwardM + sin * rightM };
}

/** One frame of walking: turn, then move at walking or running pace, inside the parcel. */
export function stepWalker(
  state: WalkerState,
  input: WalkInput,
  dtSec: number,
  world: WalkWorld,
): WalkerState {
  const dt = clamp(dtSec, 0, MAX_STEP_S);
  const headingRad = state.headingRad + input.turn * TURN_RAD_PER_S * dt;
  const speed = WALK_SPEED_M_PER_S * (input.pace === 'run' ? RUN_FACTOR : 1);
  const length = Math.hypot(input.forward, input.strafe);
  if (length === 0) return { ...state, headingRad };
  const scale = (speed * dt) / length;
  const offset = offsetFor(headingRad, input.forward * scale, input.strafe * scale);
  return { ...state, headingRad, position: moveInside(world, state.position, offset) };
}

/** The walk pad's push: forward and to the right, each -1 to 1; the length is the pace share. */
export interface StickInput {
  readonly forward: number;
  readonly strafe: number;
}

/** One frame on the walk pad: up to the pace set, in the direction pushed, inside the parcel. */
export function stepWalkerStick(
  state: WalkerState,
  stick: StickInput & Pick<WalkInput, 'pace'>,
  dtSec: number,
  world: WalkWorld,
): WalkerState {
  const length = Math.hypot(stick.forward, stick.strafe);
  if (length === 0) return state;
  const share = Math.min(1, length);
  const speed = WALK_SPEED_M_PER_S * (stick.pace === 'run' ? RUN_FACTOR : 1);
  const scale = (speed * share * clamp(dtSec, 0, MAX_STEP_S)) / length;
  const offset = offsetFor(state.headingRad, stick.forward * scale, stick.strafe * scale);
  return { ...state, position: moveInside(world, state.position, offset) };
}

const ONCE: Readonly<Record<WalkStep, { forward: number; right: number; turn: number }>> = {
  forward: { forward: REDUCED_STEP_M, right: 0, turn: 0 },
  back: { forward: -REDUCED_STEP_M, right: 0, turn: 0 },
  'step-left': { forward: 0, right: -REDUCED_STEP_M, turn: 0 },
  'step-right': { forward: 0, right: REDUCED_STEP_M, turn: 0 },
  'turn-left': { forward: 0, right: 0, turn: REDUCED_TURN_RAD },
  'turn-right': { forward: 0, right: 0, turn: -REDUCED_TURN_RAD },
};

/** Reduced motion: one key press is one whole step or turn. A step that would leave stays. */
export function stepWalkerOnce(state: WalkerState, step: WalkStep, world: WalkWorld): WalkerState {
  const move = ONCE[step];
  const headingRad = state.headingRad + move.turn;
  if (move.forward === 0 && move.right === 0) return { ...state, headingRad };
  const offset = offsetFor(headingRad, move.forward, move.right);
  const to = { x: state.position.x + offset.x, z: state.position.z + offset.z };
  return inside(world, to) ? { ...state, position: to } : state;
}

/** Turns and tilts the view by a drag; the pitch stays within 30 degrees of the horizon. */
export function lookBy(state: WalkerState, yawRad: number, pitchRad: number): WalkerState {
  return {
    ...state,
    headingRad: state.headingRad + yawRad,
    pitchRad: clamp(state.pitchRad + pitchRad, -PITCH_LIMIT_RAD, PITCH_LIMIT_RAD),
  };
}

export interface TowardStep {
  readonly state: WalkerState;
  readonly arrived: 'walking' | 'arrived';
}

/** One frame of walking to a tapped point at walking pace; the edge stops it as keys do. */
export function stepToward(
  state: WalkerState,
  target: GroundPoint,
  dtSec: number,
  world: WalkWorld,
): TowardStep {
  const dx = target.x - state.position.x;
  const dz = target.z - state.position.z;
  const left = Math.hypot(dx, dz);
  const reach = WALK_SPEED_M_PER_S * clamp(dtSec, 0, MAX_STEP_S);
  if (left <= Math.max(reach, ARRIVE_M)) {
    const position = moveInside(world, state.position, { x: dx, z: dz });
    return { state: { ...state, position }, arrived: 'arrived' };
  }
  const offset = { x: (dx / left) * reach, z: (dz / left) * reach };
  const position = moveInside(world, state.position, offset);
  const stuck = position.x === state.position.x && position.z === state.position.z;
  return { state: { ...state, position }, arrived: stuck ? 'arrived' : 'walking' };
}

/** The camera position for a walker: on the ground under it, raised to eye height. */
export function eyeOf(state: WalkerState, world: WalkWorld): Vector3 {
  const { x, z } = state.position;
  return { x, y: elevationAt(world.heightmap, state.position) + EYE_HEIGHT_M, z };
}

/** A point one metre along the view direction, for the camera to look at. */
export function lookPointOf(state: WalkerState, eye: Vector3): Vector3 {
  const flat = Math.cos(state.pitchRad);
  return {
    x: eye.x + Math.sin(state.headingRad) * flat,
    y: eye.y + Math.sin(state.pitchRad),
    z: eye.z + Math.cos(state.headingRad) * flat,
  };
}

function along(origin: Vector3, direction: Vector3, distance: number): Vector3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

function belowGround(heightmap: Heightmap, point: Vector3): boolean {
  return point.y <= elevationAt(heightmap, point);
}

/** Narrows the crossing between a point above the ground and one below it. */
function refine(heightmap: Heightmap, ray: { origin: Vector3; direction: Vector3 }, far: number) {
  let near = far - RAY_STEP_M;
  let end = far;
  for (let step = 0; step < RAY_REFINE_STEPS; step += 1) {
    const middle = (near + end) * HALF;
    if (belowGround(heightmap, along(ray.origin, ray.direction, middle))) end = middle;
    else near = middle;
  }
  const hit = along(ray.origin, ray.direction, end);
  return { x: hit.x, z: hit.z };
}

/** Where a ray from the eye first meets the terrain, or undefined when it misses. */
export function groundHit(
  origin: Vector3,
  direction: Vector3,
  heightmap: Heightmap,
): GroundPoint | undefined {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return undefined;
  const unit = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  for (let distance = RAY_STEP_M; distance <= RAY_REACH_M; distance += RAY_STEP_M) {
    if (belowGround(heightmap, along(origin, unit, distance))) {
      return refine(heightmap, { origin, direction: unit }, distance);
    }
  }
  return undefined;
}
