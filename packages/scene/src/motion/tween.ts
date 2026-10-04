import type { Clock } from '@parkshape/core';

import { eased } from './ease.js';
import type { MotionPreference } from './rise.js';
import type { CurveName } from './tokens.js';

export interface TweenOptions {
  readonly durationMs: number;
  readonly curve: CurveName;
  readonly motion: MotionPreference;
}

/** Eased 0 to 1 progress after this many ms; 1 at once under reduced motion. */
export function tweenProgress(elapsedMs: number, options: TweenOptions): number {
  if (options.motion === 'reduced' || elapsedMs >= options.durationMs) return 1;
  return eased(options.curve, Math.max(elapsedMs, 0) / options.durationMs);
}

/** Reads the browser's monotonic time as a Clock, for tweens stepped on animation frames. */
export const FRAME_CLOCK: Clock = { now: () => new Date(performance.now()) };

/** A tween that started when it was made and reads its progress from a clock. */
export class Tween {
  private readonly startMs: number;

  constructor(
    private readonly options: TweenOptions,
    private readonly clock: Clock = FRAME_CLOCK,
  ) {
    this.startMs = clock.now().getTime();
  }

  elapsedMs(): number {
    return this.clock.now().getTime() - this.startMs;
  }

  progress(): number {
    return tweenProgress(this.elapsedMs(), this.options);
  }

  state(): 'running' | 'done' {
    return this.progress() >= 1 ? 'done' : 'running';
  }
}
