import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';

import type { PlanePoint } from '@parkshape/core';

import { brushRingTween, type BrushPhase } from './level-tween.js';
import { motionPreference } from './rise.js';

export interface FadedLine {
  readonly material: { opacity: number };
}

export interface BrushRingAim {
  readonly phase: BrushPhase;
  /** Where the ring sits; null while the pointer is off the ground. */
  readonly centre: PlanePoint | null;
}

/**
 * Eases the ring lines' opacity toward the phase and draws frames until it gets there. The
 * canvas draws on demand, so a ring that has just gained or moved its centre asks for a frame
 * too; otherwise the first hover, whose frame ran before the ring mounted, would show nothing.
 */
export function useBrushRingFrames(
  { phase, centre }: BrushRingAim,
  lines: { readonly current: readonly (FadedLine | null)[] },
): void {
  const invalidate = useThree((state) => state.invalidate);
  const tween = useMemo(() => brushRingTween(motionPreference()), []);
  useEffect(() => {
    tween.to(phase);
    invalidate();
  }, [phase, centre, tween, invalidate]);
  useFrame(() => {
    const opacity = tween.value();
    lines.current.forEach((line) => {
      if (line !== null) line.material.opacity = opacity;
    });
    if (tween.state() === 'running') invalidate();
  });
}
