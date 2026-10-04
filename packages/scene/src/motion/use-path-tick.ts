import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';

import type { PlanePoint } from '@parkshape/core';

import { pathTickOf, PathTickTween, type PathTick, type PathTickLook } from './path-tick.js';
import { motionPreference } from './rise.js';

export interface DraftTick {
  readonly tick: PathTick | null;
  readonly finish: () => void;
}

/**
 * The tick for a point just added to the draft path. Backspace or a new path drops the count at
 * once, so a removed point never animates; under reduced motion nothing ticks.
 */
export function useDraftTick(draft: readonly PlanePoint[]): DraftTick {
  const motion = useMemo(motionPreference, []);
  const [settled, setSettled] = useState(draft.length);
  if (draft.length < settled) setSettled(draft.length);
  const added = motion === 'full' && draft.length > settled;
  const tick = added ? pathTickOf(draft, draft.length - 1) : null;
  const finish = useCallback(() => {
    setSettled(draft.length);
  }, [draft.length]);
  return { tick, finish };
}

/** Steps a path tick on each frame and keeps frames coming until it is done. */
export function usePathTickFrames(apply: (look: PathTickLook) => void, onDone: () => void): void {
  const invalidate = useThree((state) => state.invalidate);
  const tween = useMemo(() => new PathTickTween('full'), []);
  useFrame(() => {
    apply(tween.look());
    if (tween.state() === 'done') onDone();
    else invalidate();
  });
}
