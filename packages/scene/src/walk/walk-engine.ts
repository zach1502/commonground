import { polygonContains } from '@parkshape/core';

import type { MotionPreference } from '../motion/rise.js';
import type { GroundPoint } from '../types.js';

import { inputFrom, walkStepFor } from './walk-keys.js';
import type { WalkStart } from './walk-starts.js';
import {
  lookBy,
  stepToward,
  stepWalker,
  stepWalkerOnce,
  stepWalkerStick,
  type StickInput,
  type WalkerState,
  type WalkStep,
  type WalkWorld,
} from './walk.js';

export interface WalkEngineOptions {
  readonly world: WalkWorld;
  readonly starts: readonly WalkStart[];
  readonly motion: MotionPreference;
}

export interface KeyPress {
  readonly repeat: 'first' | 'repeat';
}

export type WalkPace = 'walk' | 'run';

type Listener = () => void;

/** A point of the view in normalised device coordinates, -1 to 1 on each axis, y up. */
export interface ViewPoint {
  readonly x: number;
  readonly y: number;
}

// Under reduced motion the pad steps once it is pushed past this share of its radius.
const PUSH_STEP_SHARE = 0.5;

/** The whole step a pad push stands for: the axis it leans on most. */
function stepOfStick(stick: StickInput): WalkStep {
  if (Math.abs(stick.forward) >= Math.abs(stick.strafe)) {
    return stick.forward > 0 ? 'forward' : 'back';
  }
  return stick.strafe > 0 ? 'step-right' : 'step-left';
}

function stateAt(start: WalkStart | undefined): WalkerState {
  return {
    position: start?.position ?? { x: 0, z: 0 },
    headingRad: start?.headingRad ?? 0,
    pitchRad: 0,
  };
}

/**
 * One walk: the walker, the keys held and a tapped target. The page's controls feed it input
 * and the canvas steps it once per drawn frame, so both read the same state.
 */
export class WalkEngine {
  private walker: WalkerState;
  private readonly held = new Set<WalkStep>();
  private running: WalkPace = 'walk';
  private target: GroundPoint | undefined;
  private tap: ViewPoint | undefined;
  private stick: StickInput | undefined;
  private pushed: 'pushed' | 'centred' = 'centred';
  private index = 0;
  private jumpCount = 0;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly options: WalkEngineOptions) {
    this.walker = stateAt(options.starts[0]);
  }

  state(): WalkerState {
    return this.walker;
  }

  world(): WalkWorld {
    return this.options.world;
  }

  startIndex(): number {
    return this.index;
  }

  startCount(): number {
    return this.options.starts.length;
  }

  /** Grows on each move to a start point, so the camera knows to fly or land there. */
  jumps(): number {
    return this.jumpCount;
  }

  /** 'live' while a key is held or the walker heads for a tapped point; frames must keep coming. */
  live(): 'live' | 'idle' {
    const moving =
      this.held.size > 0 ||
      this.target !== undefined ||
      this.tap !== undefined ||
      this.stick !== undefined;
    return moving ? 'live' : 'idle';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A key went down. Under reduced motion a press is one whole step, and repeats do nothing. */
  press(key: string, how: KeyPress): 'handled' | 'ignored' {
    const step = walkStepFor(key);
    if (step === undefined) return 'ignored';
    this.target = undefined;
    if (this.options.motion === 'reduced') {
      if (how.repeat === 'first') this.update(stepWalkerOnce(this.walker, step, this.world()));
    } else {
      this.held.add(step);
      this.notify();
    }
    return 'handled';
  }

  release(key: string): void {
    const step = walkStepFor(key);
    if (step !== undefined) this.held.delete(step);
  }

  releaseAll(): void {
    this.held.clear();
    this.target = undefined;
    this.stick = undefined;
  }

  /**
   * The walk pad: pushed, or undefined when let go. Under reduced motion a push past halfway is
   * one whole 4 m step the way it points most, and the pad must come back before the next.
   */
  setStick(stick: StickInput | undefined): void {
    this.target = undefined;
    if (this.options.motion === 'reduced') {
      this.stepOnPush(stick);
      return;
    }
    this.stick = stick;
    this.notify();
  }

  pace(): WalkPace {
    return this.running;
  }

  setPace(pace: WalkPace): void {
    if (this.running === pace) return;
    this.running = pace;
    this.notify();
  }

  /** Shift or the Run button: running turns on with one press and off with the next. */
  toggleRun(): void {
    this.setPace(this.running === 'run' ? 'walk' : 'run');
  }

  look(yawRad: number, pitchRad: number): void {
    this.update(lookBy(this.walker, yawRad, pitchRad));
  }

  /** The Turn left and Turn right buttons: 45 degrees per press in every motion setting. */
  turn(direction: 'left' | 'right'): void {
    const step = direction === 'left' ? 'turn-left' : 'turn-right';
    this.update(stepWalkerOnce(this.walker, step, this.world()));
  }

  /** A tap on the view; the canvas finds the ground under it on its next frame. */
  requestTap(point: ViewPoint): void {
    this.tap = point;
    this.notify();
  }

  takeTap(): ViewPoint | undefined {
    const tap = this.tap;
    this.tap = undefined;
    return tap;
  }

  /** A tap on the ground: walk there, or land there at once under reduced motion. */
  walkTo(point: GroundPoint): void {
    const parcel = this.world().parcel.map((corner) => ({ x: corner.x, y: corner.z }));
    if (!polygonContains(parcel, { x: point.x, y: point.z })) return;
    if (this.options.motion === 'reduced') {
      this.update({ ...this.walker, position: point });
      return;
    }
    this.target = point;
    this.notify();
  }

  /** Next entrance: the following start point, back to the first after the last. */
  next(): void {
    const count = this.options.starts.length;
    if (count === 0) return;
    this.index = (this.index + 1) % count;
    this.releaseAll();
    this.jumpCount += 1;
    this.update(stateAt(this.options.starts[this.index]));
  }

  /** One drawn frame. Returns 'live' while the walker should keep moving. */
  advance(dtSec: number): 'live' | 'idle' {
    if (this.target !== undefined) {
      const step = stepToward(this.walker, this.target, dtSec, this.world());
      if (step.arrived === 'arrived') this.target = undefined;
      this.update(step.state);
    } else if (this.stick !== undefined) {
      this.update(
        stepWalkerStick(this.walker, { ...this.stick, pace: this.running }, dtSec, this.world()),
      );
    } else if (this.held.size > 0) {
      this.update(stepWalker(this.walker, inputFrom(this.held, this.running), dtSec, this.world()));
    }
    return this.live();
  }

  private stepOnPush(stick: StickInput | undefined): void {
    const push = stick === undefined ? 0 : Math.hypot(stick.forward, stick.strafe);
    if (stick === undefined || push < PUSH_STEP_SHARE) {
      this.pushed = 'centred';
      return;
    }
    if (this.pushed === 'pushed') return;
    this.pushed = 'pushed';
    this.update(stepWalkerOnce(this.walker, stepOfStick(stick), this.world()));
  }

  private update(next: WalkerState): void {
    this.walker = next;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
