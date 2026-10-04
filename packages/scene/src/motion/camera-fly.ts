import type { Camera } from 'three';

import type { CameraPose } from '../camera/presets.js';

import { cameraMoverFor } from './camera-move.js';
import type { MotionPreference } from './rise.js';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly set: (x: number, y: number, z: number) => unknown;
}

/** The parts of orbit controls a camera move needs: the aim point and a refresh. */
export interface OrbitAim {
  readonly target: Point;
  readonly update: () => unknown;
}

/** Orbit controls that announce the start of a drag, wheel or touch. */
export interface OrbitEvents {
  readonly addEventListener: (type: 'start', listener: () => void) => void;
  readonly removeEventListener: (type: 'start', listener: () => void) => void;
}

export interface FlyCameraInput {
  readonly camera: Camera;
  readonly controls: OrbitAim | null;
  readonly to: CameraPose;
  readonly motion: MotionPreference;
  readonly invalidate: () => void;
}

/** Puts the camera and the orbit aim on a pose in one step. */
export function placeCamera(camera: Camera, controls: OrbitAim | null, pose: CameraPose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  controls?.target.set(pose.target.x, pose.target.y, pose.target.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  controls?.update();
}

function poseOf(camera: Camera, controls: OrbitAim | null): CameraPose {
  const { x, y, z } = camera.position;
  const target = controls?.target ?? { x: 0, y: 0, z: 0 };
  return { position: { x, y, z }, target: { x: target.x, y: target.y, z: target.z } };
}

/**
 * Starts the eased flight from where the camera is to a pose. Under reduced motion the camera
 * lands at once, in this frame, and any flight in progress stops.
 */
export function flyCamera({ camera, controls, to, motion, invalidate }: FlyCameraInput): void {
  const mover = cameraMoverFor(camera);
  if (motion === 'reduced') {
    mover.cancel();
    placeCamera(camera, controls, to);
  } else {
    mover.start({ from: poseOf(camera, controls), to, motion });
  }
  invalidate();
}
