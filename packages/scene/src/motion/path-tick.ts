import type { Clock, PlanePoint } from '@parkshape/core';

import type { MotionPreference } from './rise.js';
import { SMALL_MS } from './tokens.js';
import { FRAME_CLOCK, Tween } from './tween.js';

/** The newest draft point and the segment it closed; from is null for the first point. */
export interface PathTick {
  readonly index: number;
  readonly from: PlanePoint | null;
  readonly to: PlanePoint;
}

export interface PathTickLook {
  /** Uniform scale of the new segment about the previous point, 0 to 1. */
  readonly scale: number;
  readonly opacity: number;
}

/** The point at this index ticks when it is the newest point of the draft. */
export function pathTickOf(draft: readonly PlanePoint[], index: number): PathTick | null {
  if (index !== draft.length - 1) return null;
  const to = draft[index];
  if (to === undefined) return null;
  return { index, from: draft[index - 1] ?? null, to };
}

/** J20: the new segment grows from the previous point and the new vertex fades in, over 150 ms. */
export class PathTickTween {
  private readonly tween: Tween;

  constructor(motion: MotionPreference, clock: Clock = FRAME_CLOCK) {
    this.tween = new Tween({ durationMs: SMALL_MS, curve: 'entry', motion }, clock);
  }

  look(): PathTickLook {
    const amount = this.tween.progress();
    return { scale: amount, opacity: amount };
  }

  state(): 'running' | 'done' {
    return this.tween.state();
  }
}
