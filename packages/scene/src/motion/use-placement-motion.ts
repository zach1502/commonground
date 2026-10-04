import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';
import { useStore } from 'zustand';

import type { EditorStore } from '../editor/store/editor-store.js';

import { placementMotionOf, PlacementTween, type PlacementLook } from './placement-motion.js';
import type { PlacementMotion } from './placement-motion.js';
import type { MotionPreference } from './rise.js';

export interface PlacementMotionState {
  /** The settle or lift still playing, or null once it has finished or under reduced motion. */
  readonly current: PlacementMotion | null;
  readonly finish: (serial: number) => void;
}

/** The placement motion for the latest history change, until the canvas says it has finished. */
export function usePlacementMotion(
  store: EditorStore,
  motion: MotionPreference,
): PlacementMotionState {
  const change = useStore(store, (state) => state.change);
  const [finished, setFinished] = useState(change?.serial ?? 0);
  const candidate = motion === 'reduced' ? null : placementMotionOf(change);
  const current = candidate !== null && candidate.serial > finished ? candidate : null;
  const finish = useCallback((serial: number) => {
    setFinished((last) => Math.max(last, serial));
  }, []);
  return { current, finish };
}

export interface PlacementFramesInput {
  readonly motion: PlacementMotion;
  readonly preference: MotionPreference;
  /** Draws one frame of the look: the offset and opacity for every settling mesh. */
  readonly apply: (look: PlacementLook) => void;
  readonly onDone: (serial: number) => void;
}

/** Steps a settle or lift on each frame and keeps frames coming until it finishes. */
export function usePlacementFrames(input: PlacementFramesInput): void {
  const { motion, preference, apply, onDone } = input;
  const invalidate = useThree((state) => state.invalidate);
  const tween = useMemo(
    () => new PlacementTween({ kind: motion.kind, motion: preference }),
    [motion, preference],
  );
  useFrame(() => {
    apply(tween.look());
    if (tween.state() === 'done') onDone(motion.serial);
    else invalidate();
  });
}
