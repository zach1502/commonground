import { useEffect, useMemo } from 'react';

import type { PlanePoint } from '@parkshape/core';
import type { ViewerProbe } from '@parkshape/scene/viewer';

interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface WalkFrame {
  readonly eye: Spot;
  readonly groundM: number;
}

/** What the Playwright tests read from the read-only 3D view in a test build. */
export interface ViewerTestHook {
  /** Page coordinates of a plan point, liftM metres over the ground, or null behind the camera. */
  readonly screenPointOf: (
    point: PlanePoint,
    liftM?: number,
  ) => { readonly x: number; readonly y: number } | null;
  readonly cameraPose: () => ReturnType<ViewerProbe['cameraPose']> | null;
  /** The eye and the ground under it on the last walk frame; null before the first walk. */
  readonly walk: () => WalkFrame | null;
  readonly walkMode: () => 'walk' | 'overview';
}

declare global {
  interface Window {
    __parkshapeViewer?: ViewerTestHook;
  }
}

/** The viewer and walk callbacks a test build passes down; they feed window.__parkshapeViewer. */
export interface ViewerHookProps {
  readonly onProbe: (probe: ViewerProbe) => void;
  readonly walk: {
    readonly onPose: (frame: WalkFrame) => void;
    readonly onModeChange: (mode: 'walk' | 'overview') => void;
  };
}

interface HookState {
  probe: ViewerProbe | null;
  frame: WalkFrame | null;
  mode: 'walk' | 'overview';
}

function hookFor(state: HookState): ViewerTestHook {
  return {
    screenPointOf: (point, liftM) =>
      state.probe?.screenPointOf({ x: point.x, z: point.y }, liftM) ?? null,
    cameraPose: () => state.probe?.cameraPose() ?? null,
    walk: () => state.frame,
    walkMode: () => state.mode,
  };
}

/** Puts the viewer probe on window when the test hook is on; a normal build gets undefined. */
export function useViewerTestHook(testHook: 'on' | 'off'): ViewerHookProps | undefined {
  const state = useMemo<HookState>(() => ({ probe: null, frame: null, mode: 'overview' }), []);
  useEffect(() => {
    if (testHook === 'off') return undefined;
    window.__parkshapeViewer = hookFor(state);
    return () => {
      delete window.__parkshapeViewer;
    };
  }, [testHook, state]);
  return useMemo(() => {
    if (testHook === 'off') return undefined;
    return {
      onProbe: (probe) => {
        state.probe = probe;
      },
      walk: {
        onPose: ({ eye, groundM }) => {
          state.frame = { eye: { x: eye.x, y: eye.y, z: eye.z }, groundM };
        },
        onModeChange: (mode) => {
          state.mode = mode;
        },
      },
    };
  }, [testHook, state]);
}
