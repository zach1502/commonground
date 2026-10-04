import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { clearExit, motionFor, playEnter, playExit, type PanelMotion } from './panel-motion.js';
import type { MotionPreference } from './rise.js';

export type Shown = 'shown' | 'hidden';

const LEAVING = { 'aria-hidden': 'true' } as const;
const STAYING = {};

export interface Presence<T extends Element> {
  /** 'mounted' while shown and while the exit plays; render nothing once it is 'unmounted'. */
  readonly mounted: 'mounted' | 'unmounted';
  readonly ref: (element: T | null) => void;
  /** Spread on the element: while it leaves it is hidden from assistive tech and from tests. */
  readonly leaving: { readonly 'aria-hidden'?: 'true' };
}

export interface PresenceOptions {
  /** 'enter' plays the entry on the first render too, for a hint that is due on load. */
  readonly onMount?: 'enter' | 'skip';
  readonly motion?: MotionPreference;
}

/**
 * Keeps an element mounted until its exit finishes and plays its entry each time it is shown.
 * With no Web Animations or under reduced motion it unmounts in the same commit.
 */
export function usePresence<T extends Element>(
  shown: Shown,
  panel: PanelMotion,
  options: PresenceOptions = {},
): Presence<T> {
  const node = useRef<T | null>(null);
  const before = useRef<Shown | 'first'>('first');
  const [held, setHeld] = useState<Shown>(shown);
  if (shown === 'shown' && held !== 'shown') setHeld('shown');
  const live = useRef<'live' | 'gone'>('live');
  useEffect(() => {
    live.current = 'live';
    return () => {
      live.current = 'gone';
    };
  }, []);
  const { onMount, motion } = options;
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = shown;
    const play = { ...panel, ...(motion === undefined ? {} : { motion }) };
    if (shown === 'shown') {
      if (previous === 'hidden' || (previous === 'first' && onMount === 'enter')) {
        playEnter(node.current, play);
      }
      return;
    }
    if (previous !== 'shown') return;
    if (motionFor(node.current, motion) === 'instant') {
      setHeld('hidden');
      return;
    }
    void playExit(node.current, play).then(() => {
      if (live.current === 'live' && before.current === 'hidden') setHeld('hidden');
    });
  }, [shown, panel, onMount, motion]);
  // An element that stays mounted, such as the properties panel, would keep the exit's
  // forwards fill over its new content, so the fill goes in the same commit as the swap.
  useLayoutEffect(() => {
    if (held === 'hidden') clearExit(node.current);
  }, [held]);
  const ref = useCallback((element: T | null) => {
    node.current = element;
  }, []);
  const mounted = shown === 'shown' || held === 'shown' ? 'mounted' : 'unmounted';
  const exiting = shown === 'hidden' && held === 'shown';
  return { mounted, ref, leaving: exiting ? LEAVING : STAYING };
}
