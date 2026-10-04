import { useLayoutEffect, useState, type RefObject } from 'react';

import { stageBlockSize, type VoteCardFrame } from './vote-card-layout';

// Matches the phone rules in participation.css; wider windows keep the picture's own shape.
const PHONE_QUERY = '(max-width: 767px)';
const STAGE_SELECTOR = '[data-testid="vote-stage"]';
const PAGE_SELECTOR = '.web-vote';

function frameOf(card: HTMLElement): VoteCardFrame | null {
  const stage = card.querySelector(STAGE_SELECTOR);
  const last = card.lastElementChild;
  const page = card.closest(PAGE_SELECTOR);
  if (stage === null || last === null || page === null) return null;
  const stageBox = stage.getBoundingClientRect();
  const padding = Number.parseFloat(getComputedStyle(page).paddingBlockEnd) || 0;
  const { scrollY } = window;
  return {
    viewportHeight: window.innerHeight,
    stageInline: card.getBoundingClientRect().width,
    stageTop: stageBox.top + scrollY,
    stageBottom: stageBox.bottom + scrollY,
    cardBottom: last.getBoundingClientRect().bottom + scrollY + padding,
  };
}

function isPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * The phone stage height that makes the vote card fill the window, measured before the first
 * paint and again on resize. Null on wider windows. The chips region has a fixed height, so the
 * result is the same before and after a vote.
 */
export function useVoteStageBlock(card: RefObject<HTMLElement>, key: string): number | null {
  const [block, setBlock] = useState<number | null>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const frame = card.current === null || !isPhone() ? null : frameOf(card.current);
      setBlock(frame === null ? null : stageBlockSize(frame));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
    };
  }, [card, key]);
  return block;
}
