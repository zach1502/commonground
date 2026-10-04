/** Frames to draw after everything has loaded before the scene counts as on screen. */
export const READY_AFTER_FRAMES = 2;

export type ReadyState = 'waiting' | 'ready' | 'done';

export interface ReadyGate {
  /** Call once per drawn frame; returns 'ready' on exactly one frame. */
  readonly drawn: () => ReadyState;
}

/** Counts drawn frames so the ready signal fires after pixels exist, not just after loading. */
export function createReadyGate(frames: number): ReadyGate {
  let remaining = frames;
  return {
    drawn: () => {
      if (remaining <= 0) return 'done';
      remaining -= 1;
      return remaining === 0 ? 'ready' : 'waiting';
    },
  };
}
