import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import type { PlanePoint } from '@parkshape/core';

import { frameOn as computeFramePose, type CameraPose } from '../../camera/presets.js';
import { pagePointOf } from '../../components/page-point.js';
import type { FrameTarget } from '../../editor/frame-target.js';
import type { SceneBounds } from '../../geometry/sample.js';
import { flyCamera, type OrbitAim } from '../../motion/camera-fly.js';
import type { MotionPreference } from '../../motion/rise.js';

import type { ControlsHandle } from './use-terrain-gestures.js';

/** What the app may ask of the canvas; the Playwright tests use it to click exact spots. */
export interface CanvasApi {
  /**
   * Page coordinates of a ground point, or of the spot liftM metres above it, or null when it is
   * behind the camera.
   */
  readonly screenPointOf: (
    point: PlanePoint,
    liftM?: number,
  ) => { readonly x: number; readonly y: number } | null;
  /** Moves the camera to centre on a problem the meters point at. */
  readonly frameOn: (target: FrameTarget) => void;
  /** Where the camera is, the point it orbits and the ground under it, read on each call. */
  readonly cameraPose: () => CameraReading;
}

export interface CameraReading extends CameraPose {
  /** Ground height under the camera, so a test can check the camera stays above it. */
  readonly groundM: number;
}

/** Hands the orbit controls to the gesture handlers so a drag on an item does not orbit. */
export function ControlsBridge({
  target,
}: {
  readonly target: { current: ControlsHandle | null };
}): null {
  const controls = useThree((state) => state.controls) as ControlsHandle | null;
  useEffect(() => {
    target.current = controls;
  }, [controls, target]);
  return null;
}

export interface CameraBridgeProps {
  readonly elevationAt: (point: PlanePoint) => number;
  readonly bounds: SceneBounds;
  readonly onCanvasApi: (api: CanvasApi) => void;
  readonly motion: MotionPreference;
}

export function CameraBridge(props: CameraBridgeProps): null {
  const { elevationAt, bounds, onCanvasApi, motion } = props;
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const controls = useThree((state) => state.controls) as OrbitAim | null;
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    onCanvasApi({
      screenPointOf: (point, liftM = 0) => {
        const world = { x: point.x, y: elevationAt(point) + liftM, z: point.y };
        return pagePointOf(world, camera, canvas.getBoundingClientRect());
      },
      frameOn: (target) => {
        const focus = { x: target.point.x, y: elevationAt(target.point), z: target.point.y };
        const to = computeFramePose(focus, bounds);
        flyCamera({ camera, controls, to, motion, invalidate });
      },
      cameraPose: () => {
        const { x, y, z } = camera.position;
        const aim = controls?.target ?? { x: 0, y: 0, z: 0 };
        const groundM = elevationAt({ x, y: z });
        return { position: { x, y, z }, target: { x: aim.x, y: aim.y, z: aim.z }, groundM };
      },
    });
  }, [camera, canvas, controls, invalidate, elevationAt, bounds, onCanvasApi, motion]);
  return null;
}
