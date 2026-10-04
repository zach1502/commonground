import { classNames } from './class-names.js';
import { VisuallyHidden } from './visually-hidden.js';

export type RankDirection = 'up' | 'down' | 'same';

const GLYPH: Readonly<Record<RankDirection, string>> = {
  up: '\u25B2',
  down: '\u25BC',
  same: '\u2013',
};

export interface RankChangeProps {
  readonly direction: RankDirection;
  /** The text a screen reader announces, for example "up 2" or "no change". */
  readonly label: string;
}

/** An arrow that marks how a design's rank moved since the last poll, with a text alternative. */
export function RankChange({ direction, label }: RankChangeProps) {
  return (
    <span className={classNames('ps-rank-change', `ps-rank-change--${direction}`)}>
      <span aria-hidden="true">{GLYPH[direction]}</span>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
