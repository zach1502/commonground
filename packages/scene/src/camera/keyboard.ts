import { Spherical, Vector3 } from 'three';

import { clampPolarAngle } from './presets.js';

/** Radians an arrow key turns the camera around its target. About seven degrees a press. */
const ORBIT_STEP_RAD = 0.12;
/** Fraction of the view distance an arrow key moves the target across the ground. */
const PAN_FRACTION = 0.08;
/** The plus and minus keys scale the view distance by this and its inverse. */
const ZOOM_IN = 0.9;
const ZOOM_OUT = 1 / ZOOM_IN;

export interface CameraMove {
  readonly position: Vector3;
  readonly target: Vector3;
}

const ZOOM_KEYS: Readonly<Record<string, number>> = {
  '+': ZOOM_IN,
  '=': ZOOM_IN,
  '-': ZOOM_OUT,
  _: ZOOM_OUT,
};

interface Turn {
  readonly theta: number;
  readonly phi: number;
}

const ORBIT: Readonly<Record<string, Turn>> = {
  ArrowLeft: { theta: -ORBIT_STEP_RAD, phi: 0 },
  ArrowRight: { theta: ORBIT_STEP_RAD, phi: 0 },
  ArrowUp: { theta: 0, phi: -ORBIT_STEP_RAD },
  ArrowDown: { theta: 0, phi: ORBIT_STEP_RAD },
};

interface Slide {
  readonly right: number;
  readonly forward: number;
}

const PAN: Readonly<Record<string, Slide>> = {
  ArrowLeft: { right: -1, forward: 0 },
  ArrowRight: { right: 1, forward: 0 },
  ArrowUp: { right: 0, forward: 1 },
  ArrowDown: { right: 0, forward: -1 },
};

function offsetOf(move: CameraMove): Vector3 {
  return new Vector3().subVectors(move.position, move.target);
}

function orbit(move: CameraMove, turn: Turn): CameraMove {
  const spherical = new Spherical().setFromVector3(offsetOf(move));
  spherical.theta += turn.theta;
  spherical.phi = clampPolarAngle(spherical.phi + turn.phi);
  spherical.makeSafe();
  const offset = new Vector3().setFromSpherical(spherical);
  return { target: move.target, position: new Vector3().addVectors(move.target, offset) };
}

function dolly(move: CameraMove, factor: number): CameraMove {
  const offset = offsetOf(move).multiplyScalar(factor);
  return { target: move.target, position: new Vector3().addVectors(move.target, offset) };
}

function pan(move: CameraMove, slide: Slide): CameraMove {
  const offset = offsetOf(move);
  const step = offset.length() * PAN_FRACTION;
  const forward = new Vector3(-offset.x, 0, -offset.z).normalize();
  const right = new Vector3(forward.z, 0, -forward.x);
  const delta = new Vector3()
    .addScaledVector(right, slide.right * step)
    .addScaledVector(forward, slide.forward * step);
  return { target: move.target.clone().add(delta), position: move.position.clone().add(delta) };
}

/**
 * The camera pose after one key press while the canvas has focus: arrow keys orbit, Shift with an
 * arrow pans, and plus or minus zooms. Returns null for keys that do not move the camera.
 */
export function cameraKeyStep(
  move: CameraMove,
  key: string,
  shift: 'held' | 'released',
): CameraMove | null {
  const zoom = ZOOM_KEYS[key];
  if (zoom !== undefined) return dolly(move, zoom);
  if (shift === 'held') {
    const slide = PAN[key];
    return slide === undefined ? null : pan(move, slide);
  }
  const turn = ORBIT[key];
  return turn === undefined ? null : orbit(move, turn);
}
