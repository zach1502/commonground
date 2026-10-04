import type { Clock } from '@parkshape/core';

import type { MotionPreference } from './rise.js';
import { SMALL_MS, type CurveName } from './tokens.js';
import { FRAME_CLOCK, Tween } from './tween.js';

interface Leg {
  readonly from: number;
  readonly to: number;
  readonly tween: Tween;
}

export interface LevelTarget {
  readonly value: number;
  readonly curve: CurveName;
}

/** A value such as an opacity that eases from wherever it is to each new target over 150 ms. */
export class LevelTween {
  private leg: Leg;

  constructor(
    start: number,
    private readonly motion: MotionPreference,
    private readonly clock: Clock = FRAME_CLOCK,
  ) {
    this.leg = this.legTo({ value: start, curve: 'entry' }, start);
  }

  private legTo(target: LevelTarget, from: number): Leg {
    const options = { durationMs: SMALL_MS, curve: target.curve, motion: this.motion };
    return { from, to: target.value, tween: new Tween(options, this.clock) };
  }

  /** Starts a new leg from the current value; the same target again changes nothing. */
  aim(target: LevelTarget): void {
    if (target.value === this.leg.to) return;
    this.leg = this.legTo(target, this.value());
  }

  value(): number {
    const { from, to, tween } = this.leg;
    return from + (to - from) * tween.progress();
  }

  state(): 'running' | 'done' {
    return this.leg.tween.state();
  }
}

/** The juice plan J19: the brush ring shows at half strength while it aims, full while it acts. */
export const BRUSH_AIMING_OPACITY = 0.5;
export const BRUSH_APPLYING_OPACITY = 1;

export type BrushPhase = 'aiming' | 'applying';

/** The brush ring's opacity: it brightens on the entry curve and dims on the exit curve. */
export function brushRingTween(motion: MotionPreference, clock: Clock = FRAME_CLOCK) {
  const level = new LevelTween(BRUSH_AIMING_OPACITY, motion, clock);
  return {
    to(phase: BrushPhase): void {
      level.aim(
        phase === 'applying'
          ? { value: BRUSH_APPLYING_OPACITY, curve: 'entry' }
          : { value: BRUSH_AIMING_OPACITY, curve: 'exit' },
      );
    },
    value: () => level.value(),
    state: () => level.state(),
  };
}
