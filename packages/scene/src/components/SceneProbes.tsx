import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';

import { countShadowRedraws, inspectScene } from './inspect.js';
import type { SceneInspector } from './inspect.js';
import { createReadyGate, READY_AFTER_FRAMES } from './ready-gate.js';

const MS_PER_S = 1000;

export interface FrameProbeProps {
  readonly onFrameTime: (frameMs: number) => void;
}

/** Reports the time each rendered frame took, for the dev page frame counter. */
export function FrameProbe({ onFrameTime }: FrameProbeProps): null {
  useFrame((_, deltaS) => {
    onFrameTime(deltaS * MS_PER_S);
  });
  return null;
}

export interface ReadySignalProps {
  readonly onReady: () => void;
}

/**
 * Mounts only after everything above it in the Suspense boundary has loaded, then waits for
 * READY_AFTER_FRAMES drawn frames, so a screenshot taken on ready shows the textured scene.
 */
export function ReadySignal({ onReady }: ReadySignalProps): null {
  const invalidate = useThree((state) => state.invalidate);
  const gate = useMemo(() => createReadyGate(READY_AFTER_FRAMES), []);
  useEffect(() => {
    invalidate();
  }, [invalidate]);
  useFrame(() => {
    const state = gate.drawn();
    if (state === 'waiting') invalidate();
    if (state === 'ready') onReady();
  });
  return null;
}

export interface InspectProbeProps {
  readonly onInspect: (inspect: SceneInspector) => void;
  readonly composerPasses: () => readonly string[];
}

/** Hands a test hook that reads the live renderer, for the dev page's end-to-end checks. */
export function InspectProbe({ onInspect, composerPasses }: InspectProbeProps): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  // One counter per renderer, so it keeps counting across re-renders of the probe.
  const redraws = useMemo(() => countShadowRedraws(gl, scene), [gl, scene]);
  useEffect(() => redraws.stop, [redraws]);
  useEffect(() => {
    onInspect(() => inspectScene({ gl, scene, composerPasses, shadowRedraws: redraws.count }));
  }, [gl, scene, onInspect, composerPasses, redraws]);
  return null;
}
