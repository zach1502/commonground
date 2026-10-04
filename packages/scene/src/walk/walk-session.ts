import type { Camera } from 'three';

import type { CameraPose } from '../camera/presets.js';
import { placeCamera, type OrbitAim } from '../motion/camera-fly.js';
import type { Vector3 } from '../types.js';

import { lookPointOf, type WalkerState } from './walk.js';

/** The orbit controls a walk turns off while it runs and gives back afterwards. */
export interface WalkOrbit extends OrbitAim {
  enabled: boolean;
}

/** Copies the overview pose as plain numbers, so the walk can move the camera freely. */
export function captureOrbit(camera: Camera, controls: OrbitAim): CameraPose {
  const { x, y, z } = camera.position;
  const { target } = controls;
  return { position: { x, y, z }, target: { x: target.x, y: target.y, z: target.z } };
}

/** Back to overview: the saved pose in one frame, with the orbit target where it was. */
export function restoreOrbit(camera: Camera, controls: OrbitAim, saved: CameraPose): void {
  placeCamera(camera, controls, saved);
}

/** The camera pose for a walker: the eye, looking one metre ahead. */
export function walkPose(eye: Vector3, state: WalkerState): CameraPose {
  return { position: eye, target: lookPointOf(state, eye) };
}
