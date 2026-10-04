import { useLayoutEffect, useRef, type RefObject } from 'react';

import {
  crossfade,
  exit,
  MOTION_OFFSET_PX,
  motionPreference,
  type MotionOffset,
} from '@parkshape/ui';

import type { VoteResult } from './vote-batch';

const STAGE_SELECTOR = '.web-vote__stage';
const GHOST_CLASS = 'web-vote__ghost';

/** Right after Vote up, left after Vote down, up after Skip: the way the reader sent the card. */
export function advanceOffset(result: VoteResult): MotionOffset {
  if (result === 'skipped') return { axis: 'y', px: -MOTION_OFFSET_PX.card };
  return { axis: 'x', px: result === 'up' ? MOTION_OFFSET_PX.card : -MOTION_OFFSET_PX.card };
}

interface PendingAdvance {
  readonly ghost: HTMLElement;
  readonly offset: MotionOffset;
}

function stageIn(card: HTMLElement | null): HTMLElement | null {
  return card?.querySelector<HTMLElement>(STAGE_SELECTOR) ?? null;
}

/**
 * A still copy of the card's picture, taken before the next design renders. It is hidden from
 * screen readers and keyboard, carries no ids, and is dropped under reduced motion.
 */
function snapshotStage(stage: HTMLElement | null, result: VoteResult): PendingAdvance | null {
  if (stage === null || motionPreference() === 'reduced' || typeof stage.animate !== 'function') {
    return null;
  }
  const ghost = document.createElement('div');
  ghost.className = GHOST_CLASS;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Array.from(stage.children).forEach((child) => {
    const copy = child.cloneNode(true) as Element;
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((node) => {
      node.removeAttribute('id');
    });
    ghost.append(copy);
  });
  return { ghost, offset: advanceOffset(result) };
}

/** Lays the copy over the new design and plays both in the same frame, then drops the copy. */
async function playAdvance(stage: HTMLElement | null, pending: PendingAdvance | null) {
  if (stage === null || pending === null) return;
  const incoming = stage.firstElementChild;
  stage.append(pending.ghost);
  try {
    if (incoming === null) await exit(pending.ghost, { offset: pending.offset });
    else await crossfade({ outgoing: pending.ghost, incoming, offset: pending.offset });
  } finally {
    pending.ghost.remove();
  }
}

/**
 * J14: the outgoing card leaves the way the vote went while the next design fades in over the
 * same slot. `capture` runs in the press handler, before the batch moves on; the play runs in a
 * layout effect once the next design is in the DOM, so both start in one frame.
 */
export function useCardAdvance(card: RefObject<HTMLElement>, index: number) {
  const pending = useRef<PendingAdvance | null>(null);
  useLayoutEffect(() => {
    const next = pending.current;
    pending.current = null;
    void playAdvance(stageIn(card.current), next);
  }, [card, index]);
  return {
    capture: (result: VoteResult) => {
      pending.current = snapshotStage(stageIn(card.current), result);
    },
  };
}
