import { useCallback } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { FADE, playEnter } from '../motion/panel-motion.js';
import type { MotionPreference } from '../motion/rise.js';

export interface CommentChipProps {
  readonly count: number;
  /** The chip's accessible name, such as "3 comments on Bench". */
  readonly label: string;
  readonly motion: MotionPreference;
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  minInlineSize: '1.5rem',
  minBlockSize: '1.5rem',
  padding: '0 var(--layout-padding-xsmall)',
  font: 'var(--typography-bold-small-body)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--typography-color-primary)',
  background: 'var(--surface-color-background-white)',
  border: 'var(--layout-border-width-small) solid var(--surface-color-border-dark)',
  borderRadius: 'var(--layout-border-radius-small)',
  whiteSpace: 'nowrap',
};

/** The comment count on one element. It fades in over 150 ms, or at once under reduced motion. */
export function CommentChip({ count, label, motion }: CommentChipProps): ReactElement {
  const reveal = useCallback(
    (element: HTMLSpanElement | null) => {
      playEnter(element, { ...FADE, motion });
    },
    [motion],
  );
  return (
    <span ref={reveal} role="img" aria-label={label} style={chipStyle} data-comment-chip="">
      {count}
    </span>
  );
}
