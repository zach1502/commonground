import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { Heightmap } from '@parkshape/core';

import type { MotionPreference } from '../motion/rise.js';
import type { ParkDocument } from '../types.js';

import type { WalkEngine } from './walk-engine.js';
import type { WalkProps } from './walk-props.js';
import { WalkCamera } from './WalkCamera.js';
import { WalkControls } from './WalkControls.js';
import { WalkInset } from './WalkInset.js';
import { WalkStartButton } from './WalkStartButton.js';

export interface WalkSceneInput {
  readonly document: ParkDocument;
  readonly terrain: Heightmap;
  readonly motion: MotionPreference;
  /** Whether the scene has drawn; a walk that starts on ready waits for it. Ready by default. */
  readonly ready?: 'loading' | 'ready';
}

export interface WalkScene {
  readonly mode: 'overview' | 'walk';
  /** The walk camera, drawn inside the canvas while walking. */
  readonly layer: ReactNode;
  /** The input layer and the "you are here" map over the canvas while walking. */
  readonly overlay: ReactNode;
  /** "Walk the park" for the viewer toolbar, or null without a walk. */
  readonly startControl: ReactNode;
}

const NO_LABELS: ReadonlyMap<string, string> = new Map();

/**
 * Starts the walk once each time the page asks for it and the scene is ready, so a new
 * onModeChange after the walk ends does not start it again.
 */
function useStartOnReady(
  walk: WalkProps | undefined,
  ready: WalkSceneInput['ready'],
  start: () => void,
): void {
  const asked = walk?.start === 'on-ready' && (ready ?? 'ready') === 'ready';
  const started = useRef(false);
  useEffect(() => {
    if (!asked) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    start();
  }, [asked, start]);
}

/** "Walk the park" shows in the toolbar in the overview, unless the page starts the walk. */
function offersStart(walk: WalkProps, mode: 'overview' | 'walk'): boolean {
  return mode === 'overview' && walk.start !== 'on-ready';
}

/**
 * The walk's part of the viewer. "Walk the park" starts it; Escape or "Back to overview" ends
 * it, puts the overview pose back and returns focus to "Walk the park".
 */
export function useWalkScene(walk: WalkProps | undefined, input: WalkSceneInput): WalkScene {
  const [mode, setMode] = useState<'overview' | 'walk'>('overview');
  const [engine, setEngine] = useState<WalkEngine | null>(null);
  const [returned, setReturned] = useState<'first' | 'returned'>('first');
  const onModeChange = walk?.onModeChange;
  const start = useCallback(() => {
    setMode('walk');
    onModeChange?.('walk');
  }, [onModeChange]);
  const exit = useCallback(() => {
    setMode('overview');
    setEngine(null);
    setReturned('returned');
    onModeChange?.('overview');
  }, [onModeChange]);
  useStartOnReady(walk, input.ready, start);
  const items = useMemo(
    () => input.document.items.map((item) => ({ id: item.id, position: item.position })),
    [input.document],
  );
  if (walk === undefined) return { mode, layer: null, overlay: null, startControl: null };
  const layer =
    mode === 'walk' ? (
      <WalkCamera
        document={input.document}
        parcel={walk.parcel}
        heightmap={input.terrain}
        motion={input.motion}
        onEngine={setEngine}
        onPose={walk.onPose}
      />
    ) : null;
  const overlay =
    mode === 'walk' && engine !== null ? (
      <WalkControls
        engine={engine}
        strings={walk.strings}
        motion={input.motion}
        items={items}
        labels={walk.labels ?? NO_LABELS}
        onExit={exit}
        inset={<WalkInset engine={engine} parcel={walk.parcel} document={input.document} />}
      />
    ) : null;
  const startControl = offersStart(walk, mode) ? (
    <WalkStartButton label={walk.strings.start} focus={returned} onPress={start} />
  ) : null;
  return { mode, layer, overlay, startControl };
}
