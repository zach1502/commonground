import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { ElementRef, ReactElement } from 'react';
import type { Camera, Vector3 as ThreeVector } from 'three';

import { createDampingSettler } from '../camera/damping-tail.js';
import { framingOf, reframeFor, type CameraHold, type Framing } from '../camera/framing.js';
import { cameraKeyStep } from '../camera/keyboard.js';
import {
  clampOrbit,
  orbitLimitsFor,
  type GroundHeight,
  type OrbitLimits,
} from '../camera/limits.js';
import { cameraPreset, MAX_POLAR_ANGLE_RAD, MIN_POLAR_ANGLE_RAD } from '../camera/presets.js';
import type { PresetName } from '../camera/presets.js';
import type { SceneBounds } from '../geometry/sample.js';
import { flyCamera, placeCamera } from '../motion/camera-fly.js';
import { cameraMoverFor } from '../motion/camera-move.js';
import type { MotionPreference } from '../motion/rise.js';
import { useCameraMoveFrames, useCancelCameraOnInput } from '../motion/use-camera-move.js';

const DAMPING = 0.1;
// Each wheel event dollies by 0.95 to this power, so one notch moves the camera about 10%.
const ZOOM_SPEED = 2;

/** A preset the viewer asked for; request grows on each click so the same preset can repeat. */
export interface ViewRequest {
  readonly preset: PresetName;
  readonly request: number;
}

/** 'canvas' lets the arrow keys pan the camera while the canvas has focus, as in the editor. */
export type KeyTarget = 'canvas' | 'none';

export interface ControlsProps {
  readonly bounds: SceneBounds;
  readonly view: ViewRequest;
  readonly onStart?: (() => void) | undefined;
  readonly keys?: KeyTarget;
  /** Under 'reduced' a preset lands in one frame and a drag stops with no inertia. */
  readonly motion?: MotionPreference;
  /** Ground height under a point, so the camera never goes below the terrain. */
  readonly ground?: GroundHeight | undefined;
}

interface OrbitRef {
  readonly current: ElementRef<typeof OrbitControls> | null;
}
interface HoldRef {
  current: CameraHold;
}

interface PresetViewInput {
  readonly bounds: SceneBounds;
  readonly view: ViewRequest;
  readonly motion: MotionPreference;
  readonly controls: OrbitRef;
  readonly aspect: number;
  readonly hold: HoldRef;
}

/**
 * Frames the requested preset. A click on a preset flies there over 400 ms; the first frame,
 * a new parcel and a resize before the person moves the camera put it there at once. An edit
 * rebuilds the bounds with the same values and leaves the camera where the person put it.
 */
function usePresetView({ bounds, view, motion, controls, aspect, hold }: PresetViewInput): void {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const shown = useRef<Framing | null>(null);
  useEffect(() => {
    const next = framingOf({ bounds, aspect, request: view.request });
    const reframe = reframeFor({ shown: shown.current, next, camera: hold.current });
    shown.current = next;
    if (reframe === 'hold') return;
    const pose = cameraPreset(view.preset, bounds, aspect);
    hold.current = 'framed';
    if (reframe === 'fly') {
      flyCamera({ camera, controls: controls.current, to: pose, motion, invalidate });
    } else {
      placeCamera(camera, controls.current, pose);
    }
  }, [bounds, camera, view, aspect, motion, controls, invalidate, hold]);
}

const FLAT: GroundHeight = () => -Infinity;

/** Puts the camera and target back inside the zoom limits and above the ground, if needed. */
function keepInside(
  camera: Camera,
  current: { readonly target: ThreeVector },
  limits: OrbitLimits,
  ground: GroundHeight,
): void {
  const fixed = clampOrbit({ position: camera.position, target: current.target }, limits, ground);
  if (fixed === null) return;
  camera.position.set(fixed.position.x, fixed.position.y, fixed.position.z);
  current.target.set(fixed.target.x, fixed.target.y, fixed.target.z);
  camera.lookAt(fixed.target.x, fixed.target.y, fixed.target.z);
}

interface CameraKeysInput {
  readonly controls: OrbitRef;
  readonly keys: KeyTarget;
  readonly limits: OrbitLimits;
  readonly ground: GroundHeight;
  readonly onMove: () => void;
}

/**
 * Focus on the canvas turns on arrow-key orbit, Shift-arrow pan and plus or minus zoom, without
 * taking the keys from form fields. Each step stays inside the same limits as the wheel.
 */
function useCameraKeys({ controls, keys, limits, ground, onMove }: CameraKeysInput): void {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const current = controls.current;
    if (keys !== 'canvas' || current === null) return undefined;
    canvas.tabIndex = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const shift = event.shiftKey ? 'held' : 'released';
      const move = cameraKeyStep(
        { position: camera.position, target: current.target },
        event.key,
        shift,
      );
      if (move === null) return;
      event.preventDefault();
      cameraMoverFor(camera).cancel();
      const pose = clampOrbit(move, limits, ground) ?? move;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      current.target.set(pose.target.x, pose.target.y, pose.target.z);
      camera.lookAt(current.target);
      current.update();
      onMove();
    };
    canvas.addEventListener('keydown', onKeyDown);
    return () => {
      canvas.removeEventListener('keydown', onKeyDown);
    };
  }, [canvas, camera, controls, keys, limits, ground, onMove]);
}

/**
 * Marks the camera as moved by the person on any drag, wheel or touch, and after each change of
 * the orbit puts the camera back inside the limits. Zoom to the cursor moves the target along the
 * pointer ray, so on sloped ground it could otherwise carry the camera under the terrain. Once the
 * orbit stops changing, the rest of the inertia is spent at once, so a later edit cannot move it.
 */
function useOrbitGuard(
  controls: OrbitRef,
  hold: HoldRef,
  limits: OrbitLimits,
  ground: GroundHeight,
) {
  const camera = useThree((state) => state.camera);
  const settler = useMemo(() => createDampingSettler(() => controls.current), [controls]);
  // Runs after drei's own update at priority -1, and below 1 so R3F keeps drawing the frame.
  useFrame(() => {
    settler.frame();
  });
  useEffect(() => {
    const current = controls.current;
    if (current === null) return undefined;
    const onStart = () => {
      hold.current = 'moved';
    };
    const onChange = () => {
      settler.changed();
      keepInside(camera, current, limits, ground);
    };
    current.addEventListener('start', onStart);
    current.addEventListener('change', onChange);
    return () => {
      current.removeEventListener('start', onStart);
      current.removeEventListener('change', onChange);
    };
  }, [camera, controls, hold, limits, ground, settler]);
}

/** The canvas aspect, read from the R3F size, so the presets fit the real frame. */
function useAspect(): number {
  return useThree((state) => state.size.width / Math.max(state.size.height, 1));
}

/**
 * Orbit, pan and zoom with touch and damping. Pitch is clamped, the zoom stays between 4 m and
 * 1.5 times the parcel's bounding sphere fit, and the camera stays above the ground.
 */
export function Controls(props: ControlsProps): ReactElement {
  const { bounds, onStart, keys = 'none', motion = 'full', ground = FLAT } = props;
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const hold = useRef<CameraHold>('framed');
  const aspect = useAspect();
  const { minX, maxX, minZ, maxZ, minY, maxY } = bounds;
  const limits = useMemo(
    () => orbitLimitsFor({ minX, maxX, minZ, maxZ, minY, maxY }),
    [minX, maxX, minZ, maxZ, minY, maxY],
  );
  useCameraMoveFrames(controls);
  useCancelCameraOnInput(controls);
  useOrbitGuard(controls, hold, limits, ground);
  const onKeyMove = useMemo(
    () => () => {
      hold.current = 'moved';
      onStart?.();
    },
    [onStart],
  );
  useCameraKeys({ controls, keys, limits, ground, onMove: onKeyMove });
  usePresetView({ bounds, view: props.view, motion, controls, aspect, hold });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={motion === 'full'}
      dampingFactor={DAMPING}
      minPolarAngle={MIN_POLAR_ANGLE_RAD}
      maxPolarAngle={MAX_POLAR_ANGLE_RAD}
      minDistance={limits.minDistanceM}
      maxDistance={limits.maxDistanceM}
      zoomToCursor
      zoomSpeed={ZOOM_SPEED}
      {...(onStart === undefined ? {} : { onStart })}
    />
  );
}
