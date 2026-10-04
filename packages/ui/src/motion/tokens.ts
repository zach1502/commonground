/** The two DESIGN.md durations, in ms: small changes and panels, dialogs and views. */
export const MOTION_MS = {
  small: 150,
  medium: 250,
} as const;

/** Entry decelerates, exit accelerates, and something that stays on screen and moves uses move. */
export const MOTION_EASING = {
  entry: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 1, 1)',
  move: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/** How far a layer travels as it enters or leaves: a dialog 8 px, a card or side panel 16 px. */
export const MOTION_OFFSET_PX = {
  dialog: 8,
  card: 16,
} as const;

/** The longest a submit can wait with no new feedback before the progress bar shows. */
export const PROGRESS_DELAY_MS = 1000;
