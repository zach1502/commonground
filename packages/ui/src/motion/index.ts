/** Class names defined in motion.css, pulse.css and press.css; the only place the UI declares animation. */
export const MOTION_CLASS = {
  fill: 'ps-motion-fill',
  status: 'ps-motion-status',
  reveal: 'ps-motion-reveal',
  pulse: 'ps-motion-pulse',
  state: 'ps-motion-state',
  press: 'ps-motion-press',
  enter: 'ps-motion-enter',
  exit: 'ps-motion-exit',
  progress: 'ps-motion-progress',
} as const;

export { MOTION_EASING, MOTION_MS, MOTION_OFFSET_PX, PROGRESS_DELAY_MS } from './tokens.js';
export { crossfade, drawCheck, enter, exit, fadeIn, flip, motionPreference } from './animate.js';
export { useSetReveal } from './use-set-reveal.js';
export type {
  CrossfadeParts,
  FlipMove,
  LayerMotion,
  MotionOffset,
  MotionPreference,
} from './animate.js';
