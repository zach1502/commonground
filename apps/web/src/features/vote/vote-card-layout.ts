/**
 * Where the phone vote card sits, in CSS px page offsets, measured with the stage at any size.
 * Under the stage are the view buttons, one line of progress and hint, and the vote buttons.
 * The reason chips open as a sheet over the vote buttons, so they take no room here and the
 * chrome under the stage is the same before and after a vote.
 */
export interface VoteCardFrame {
  readonly viewportHeight: number;
  readonly stageInline: number;
  /** The header, page title and design name above the stage end here. */
  readonly stageTop: number;
  readonly stageBottom: number;
  /** The bottom of the card's last row, the vote buttons, plus the page padding under them. */
  readonly cardBottom: number;
}

/** Under this the picture is too small to judge, so the page scrolls instead. */
export const STAGE_MIN_BLOCK_PX = 120;

/** On a tall phone the stage stops at this many times its width, so the park keeps a shape. */
export const STAGE_MAX_BLOCK_PER_INLINE = 1.5;

/**
 * The stage height that makes the card end at the window's bottom edge: the window height less
 * the header, title and design name above the stage and the view buttons, the one-line region,
 * the vote buttons and the footer padding below it.
 */
export function stageBlockSize(frame: VoteCardFrame): number {
  const below = frame.cardBottom - frame.stageBottom;
  const room = Math.floor(frame.viewportHeight - frame.stageTop - below);
  const tallest = Math.floor(frame.stageInline * STAGE_MAX_BLOCK_PER_INLINE);
  return Math.max(STAGE_MIN_BLOCK_PX, Math.min(room, tallest));
}
