import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Group } from 'three';

import { riseOffsetM, VIEW_CHANGE_MS } from '../motion/rise.js';
import type { MotionPreference } from '../motion/rise.js';

const RISE_DEPTH_M = 8;
const MS_PER_S = 1000;

export interface RisingIslandProps {
  readonly motion: MotionPreference;
  readonly children: ReactNode;
  /** Called on each frame the island moves, so the shadow map follows it up. */
  readonly onMove?: () => void;
}

/** Lifts the island into place once after it loads; no movement when reduced motion is set. */
export function RisingIsland({ motion, children, onMove }: RisingIslandProps): ReactElement {
  const group = useRef<Group>(null);
  const elapsedMs = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, deltaS) => {
    if (group.current === null || elapsedMs.current > VIEW_CHANGE_MS) {
      return;
    }
    elapsedMs.current += deltaS * MS_PER_S;
    group.current.position.y = riseOffsetM(elapsedMs.current, {
      durationMs: VIEW_CHANGE_MS,
      depthM: RISE_DEPTH_M,
      motion,
    });
    onMove?.();
    // Keeps the rise drawing when the canvas only renders on demand.
    invalidate();
  });
  return (
    <group ref={group} position-y={motion === 'reduced' ? 0 : -RISE_DEPTH_M}>
      {children}
    </group>
  );
}
