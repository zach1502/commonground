import { useEffect, useMemo, useState } from 'react';

import type { WalkStrings } from './strings.js';
import { Announcer, fillWalk, nearestAhead, type WalkLandmark } from './walk-announce.js';
import type { WalkEngine } from './walk-engine.js';

export interface WalkAnnouncementsInput {
  readonly engine: WalkEngine;
  readonly strings: WalkStrings;
  readonly items: readonly WalkLandmark[];
  readonly labels: ReadonlyMap<string, string>;
  readonly now?: (() => number) | undefined;
}

const browserNow = () => performance.now();

function startLine(engine: WalkEngine, strings: WalkStrings): string {
  return fillWalk(strings.startAt, { index: engine.startIndex() + 1, count: engine.startCount() });
}

/** The line after a change: the new start after a jump, else the item ahead, if any. */
function lineAfter(input: WalkAnnouncementsInput, jumped: 'jumped' | 'walked'): string | undefined {
  const { engine, strings } = input;
  if (jumped === 'jumped') return startLine(engine, strings);
  const ahead = nearestAhead(engine.state(), input.items, input.labels);
  if (ahead === undefined) return undefined;
  return fillWalk(strings.near, { label: ahead.label, n: Math.round(ahead.distanceM) });
}

/**
 * The live region's line: the start point when the walk starts or jumps, then the labelled item
 * ahead as the walker moves, at most once a second.
 */
export function useWalkAnnouncements(input: WalkAnnouncementsInput): string {
  const { engine, strings, items, labels } = input;
  const now = input.now ?? browserNow;
  const announcer = useMemo(() => new Announcer(), []);
  const [line, setLine] = useState(() => {
    const first = startLine(engine, strings);
    announcer.offer(first, now(), 'now');
    return first;
  });
  useEffect(() => {
    let jumps = engine.jumps();
    return engine.subscribe(() => {
      const jumped = engine.jumps() === jumps ? 'walked' : 'jumped';
      jumps = engine.jumps();
      const next = lineAfter({ engine, strings, items, labels }, jumped);
      if (next === undefined) return;
      const shown = announcer.offer(next, now(), jumped === 'jumped' ? 'now' : 'paced');
      if (shown !== undefined) setLine(shown);
    });
  }, [engine, strings, items, labels, now, announcer]);
  return line;
}
