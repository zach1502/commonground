import type { Clock } from '@parkshape/core';

import type { CameraPose } from '../camera/presets.js';
import type { Vector3 } from '../types.js';

import type { MotionPreference } from './rise.js';
import { CAMERA_MOVE_MS } from './tokens.js';
import { FRAME_CLOCK, Tween } from './tween.js';

export interface CameraMoveRequest {
  readonly from: CameraPose;
  readonly to: CameraPose;
  readonly motion: MotionPreference;
}

function blend(from: Vector3, to: Vector3, amount: number): Vector3 {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
  };
}

/** The pose part way along a move; position and target travel together so the aim stays steady. */
export function cameraPoseAt(from: CameraPose, to: CameraPose, amount: number): CameraPose {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  return {
    position: blend(from.position, to.position, amount),
    target: blend(from.target, to.target, amount),
  };
}

interface Flight {
  readonly request: CameraMoveRequest;
  readonly tween: Tween;
}

/**
 * The camera's eased flight to a preset or a Show me target, over 400 ms on the move curve.
 * Input cancels it where it is. Under reduced motion the first step lands on the final pose.
 */
export class CameraMover {
  private flight: Flight | null = null;

  constructor(private readonly clock: Clock = FRAME_CLOCK) {}

  start(request: CameraMoveRequest): void {
    const tween = new Tween(
      { durationMs: CAMERA_MOVE_MS, curve: 'move', motion: request.motion },
      this.clock,
    );
    this.flight = { request, tween };
  }

  cancel(): void {
    this.flight = null;
  }

  /** The pose for this frame, or null when no move is running. The last step is the final pose. */
  step(): CameraPose | null {
    const flight = this.flight;
    if (flight === null) return null;
    const amount = flight.tween.progress();
    if (amount >= 1) this.flight = null;
    return cameraPoseAt(flight.request.from, flight.request.to, amount);
  }

  state(): 'moving' | 'idle' {
    return this.flight === null ? 'idle' : 'moving';
  }
}

const movers = new WeakMap<object, CameraMover>();

/** The one mover for a camera, shared by the view presets and the meters' Show me. */
export function cameraMoverFor(camera: object): CameraMover {
  const found = movers.get(camera);
  if (found !== undefined) return found;
  const mover = new CameraMover();
  movers.set(camera, mover);
  return mover;
}
