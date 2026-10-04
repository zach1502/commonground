export type MotionPreference = 'full' | 'reduced';

export interface RiseOptions {
  readonly durationMs: number;
  readonly depthM: number;
  readonly motion: MotionPreference;
}

export { VIEW_CHANGE_MS } from './tokens.js';
const EASE_POWER = 3;

/** Vertical offset of the island while it rises into place after loading; eases out. */
export function riseOffsetM(elapsedMs: number, options: RiseOptions): number {
  if (options.motion === 'reduced' || elapsedMs >= options.durationMs) {
    return 0;
  }
  const progress = Math.max(elapsedMs, 0) / options.durationMs;
  const eased = 1 - (1 - progress) ** EASE_POWER;
  return -options.depthM * (1 - eased);
}

/** Reads the reader's motion setting, assuming full motion outside a browser. */
export function motionPreference(): MotionPreference {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'full';
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}
