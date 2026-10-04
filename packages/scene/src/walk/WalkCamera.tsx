import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 as ThreeVector } from 'three';
import type { Camera } from 'three';

import type { Heightmap } from '@parkshape/core';

import type { CameraPose } from '../camera/presets.js';
import { elevationAt } from '../geometry/sample.js';
import { cameraMoverFor, CameraMover } from '../motion/camera-move.js';
import type { MotionPreference } from '../motion/rise.js';
import type { GroundPoint, ParkDocument, Vector3 } from '../types.js';

import { WalkEngine } from './walk-engine.js';
import { captureOrbit, restoreOrbit, walkPose, type WalkOrbit } from './walk-session.js';
import { walkStarts } from './walk-starts.js';
import { eyeOf, groundHit, type WalkWorld } from './walk.js';

// Up close a bench is under a metre away; the overview's 1 m near plane would cut it.
const WALK_NEAR_M = 0.2;
// The middle of the depth range, so the unprojected point lies along the tap ray.
const UNPROJECT_DEPTH = 0.5;

/** What the walk reports on each frame, for the dev page's end-to-end checks. */
export interface WalkProbe {
  readonly eye: Vector3;
  readonly groundM: number;
}

export interface WalkCameraProps {
  readonly document: ParkDocument;
  readonly parcel: readonly GroundPoint[];
  readonly heightmap: Heightmap;
  readonly motion: MotionPreference;
  readonly onEngine: (engine: WalkEngine) => void;
  readonly onPose?: ((probe: WalkProbe) => void) | undefined;
}

interface Session {
  readonly engine: WalkEngine;
  readonly flight: CameraMover;
  jumps: number;
}

function isWalkOrbit(value: unknown): value is WalkOrbit {
  return typeof value === 'object' && value !== null && 'target' in value && 'enabled' in value;
}

function aim(camera: Camera, pose: CameraPose): void {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
}

function setNear(camera: Camera, nearM: number): number {
  if (!(camera instanceof PerspectiveCamera)) return nearM;
  const before = camera.near;
  camera.near = nearM;
  camera.updateProjectionMatrix();
  return before;
}

/** Where the camera is and what it looks at, read from the camera itself. */
function cameraPose(camera: Camera): CameraPose {
  const ahead = camera.getWorldDirection(new ThreeVector()).add(camera.position);
  const { x, y, z } = camera.position;
  return { position: { x, y, z }, target: { x: ahead.x, y: ahead.y, z: ahead.z } };
}

function poseNow(engine: WalkEngine): CameraPose {
  return walkPose(eyeOf(engine.state(), engine.world()), engine.state());
}

/** Finds the ground under a tap on the view and sends the walker there. */
function resolveTap(camera: Camera, engine: WalkEngine): void {
  const tap = engine.takeTap();
  if (tap === undefined) return;
  const through = new ThreeVector(tap.x, tap.y, UNPROJECT_DEPTH).unproject(camera);
  const direction = through.sub(camera.position);
  const hit = groundHit(camera.position, direction, engine.world().heightmap);
  if (hit !== undefined) engine.walkTo(hit);
}

/**
 * Starts the walk: turns the orbit off, saves its pose and builds the walk from the start
 * nearest the view. On the way out it puts the saved pose back in one frame.
 */
function useWalkSession(props: WalkCameraProps) {
  const { document, parcel, heightmap, motion, onEngine } = props;
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const invalidate = useThree((state) => state.invalidate);
  const session = useRef<Session | null>(null);
  useLayoutEffect(() => {
    const orbit = isWalkOrbit(controls) ? controls : null;
    const fallbackAim = { target: new ThreeVector(), update: () => undefined };
    const saved = captureOrbit(camera, orbit ?? fallbackAim);
    cameraMoverFor(camera).cancel();
    if (orbit !== null) orbit.enabled = false;
    const near = setNear(camera, WALK_NEAR_M);
    const world: WalkWorld = { heightmap, parcel };
    const near2d = { x: saved.target.x, z: saved.target.z };
    const engine = new WalkEngine({
      world,
      starts: walkStarts({ document, parcel, near: near2d }),
      motion,
    });
    const flight = new CameraMover();
    flight.start({ from: saved, to: poseNow(engine), motion });
    session.current = { engine, flight, jumps: engine.jumps() };
    const unsubscribe = engine.subscribe(invalidate);
    onEngine(engine);
    invalidate();
    return () => {
      unsubscribe();
      session.current = null;
      setNear(camera, near);
      if (orbit !== null) {
        restoreOrbit(camera, orbit, saved);
        orbit.enabled = true;
      } else aim(camera, saved);
      invalidate();
    };
  }, [camera, controls, invalidate, document, parcel, heightmap, motion, onEngine]);
  return session;
}

/**
 * The walk camera inside the canvas. Each drawn frame it flies to a new start, finds the
 * ground under a tap, steps the walker and puts the camera at its eye. It asks for the next
 * frame only while something moves, which fits the viewer's draw-on-demand loop.
 */
export function WalkCamera(props: WalkCameraProps): null {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const session = useWalkSession(props);
  const { onPose, motion } = props;
  useFrame((_, deltaS) => {
    const current = session.current;
    if (current === null) return;
    const { engine, flight } = current;
    if (engine.jumps() !== current.jumps) {
      current.jumps = engine.jumps();
      flight.start({ from: cameraPose(camera), to: poseNow(engine), motion });
    }
    const flying = flight.step();
    if (flying !== null) {
      aim(camera, flying);
      invalidate();
      return;
    }
    resolveTap(camera, engine);
    engine.advance(deltaS);
    const pose = poseNow(engine);
    aim(camera, pose);
    const { x, y, z } = camera.position;
    onPose?.({ eye: { x, y, z }, groundM: elevationAt(engine.world().heightmap, { x, z }) });
    if (engine.live() === 'live') invalidate();
  });
  return null;
}
