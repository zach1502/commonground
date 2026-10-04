import { motionPreference, type MotionPreference } from './rise.js';
import { cssCurve, SMALL_MS, VIEW_CHANGE_MS } from './tokens.js';

/** The slice of Element the helpers use, so tests can hand in a fake animate. */
export interface Animatable {
  readonly animate?: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => PlayingAnimation;
}

/** The slice of Animation the helpers use. */
export interface PlayingAnimation {
  readonly finished: Promise<unknown>;
  readonly cancel?: () => void;
}

/**
 * The exit each element still holds. An exit fills forwards so the element stays hidden until
 * the caller unmounts it or swaps its content; on an element that stays mounted that fill would
 * keep it hidden after the next entry ends, so the next entry or `clearExit` cancels it.
 */
const heldExits = new WeakMap<Animatable, PlayingAnimation>();

/** Cancels the exit still held on an element, which drops its forwards-filled end state. */
export function clearExit(element: Animatable | null): void {
  if (element === null) return;
  heldExits.get(element)?.cancel?.();
  heldExits.delete(element);
}

/** How a panel enters: where it starts and how long the entry runs. The exit is the reverse. */
export interface PanelMotion {
  readonly from: Keyframe;
  readonly enterMs: number;
}

const SHOWN: Keyframe = { opacity: 1, transform: 'none' };

/** J4: the shortcuts sheet rises 8 px from its bottom edge over 250 ms. */
export const RISE_FROM_BELOW: PanelMotion = {
  from: { opacity: 0, transform: 'translateY(8px)' },
  enterMs: VIEW_CHANGE_MS,
};
/** J5: the properties panel slides 16 px in from the right edge over 250 ms. */
export const FROM_RIGHT: PanelMotion = {
  from: { opacity: 0, transform: 'translateX(16px)' },
  enterMs: VIEW_CHANGE_MS,
};
/** J7 and J22: a new items list row or a hint fades in over 150 ms. */
export const FADE: PanelMotion = { from: { opacity: 0 }, enterMs: SMALL_MS };

export interface PlayOptions extends PanelMotion {
  readonly motion?: MotionPreference;
}

function shownFrame(from: Keyframe): Keyframe {
  return 'transform' in from ? SHOWN : { opacity: 1 };
}

function canAnimate(element: Animatable | null, motion: MotionPreference | undefined) {
  if (element?.animate === undefined) return null;
  return (motion ?? motionPreference()) === 'full' ? element.animate.bind(element) : null;
}

/** 'animates' when the element can run Web Animations and the reader allows motion. */
export function motionFor(
  element: Animatable | null,
  motion?: MotionPreference,
): 'animates' | 'instant' {
  return canAnimate(element, motion) === null ? 'instant' : 'animates';
}

/** Plays a panel's entry with the Web Animations API; nothing runs under reduced motion. */
export function playEnter(element: Animatable | null, options: PlayOptions): void {
  clearExit(element);
  const animate = canAnimate(element, options.motion);
  animate?.([options.from, shownFrame(options.from)], {
    duration: options.enterMs,
    easing: cssCurve('entry'),
  });
}

/**
 * Plays the reverse of the entry over 150 ms, never longer than the entry, and resolves when it
 * ends, so the caller unmounts after it. Under reduced motion it resolves at once.
 */
export async function playExit(element: Animatable | null, options: PlayOptions): Promise<void> {
  const animate = canAnimate(element, options.motion);
  if (animate === null) return;
  const playing = animate([shownFrame(options.from), options.from], {
    duration: Math.min(SMALL_MS, options.enterMs),
    easing: cssCurve('exit'),
    fill: 'forwards',
  });
  if (element !== null) heldExits.set(element, playing);
  await playing.finished.catch(() => undefined);
}
