import { MOTION_EASING, MOTION_MS } from './tokens.js';

export type MotionPreference = 'full' | 'reduced';

/** A short slide along one axis; a negative `px` starts left of or above the resting place. */
export interface MotionOffset {
  readonly axis: 'x' | 'y';
  readonly px: number;
}

export interface LayerMotion {
  readonly offset?: MotionOffset;
  readonly durationMs?: number;
}

export interface FlipMove {
  readonly element: Element;
  /** How far above (negative) or below the new place the element was drawn last time. */
  readonly fromPx: number;
}

export interface CrossfadeParts {
  readonly outgoing: Element;
  readonly incoming: Element;
  /** Where the outgoing layer goes as it fades. */
  readonly offset: MotionOffset;
}

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const HALF = 2;
const CHECK_STROKE_MS = MOTION_MS.small / HALF;

/** 'reduced' when the reader asked for less motion, so every change lands at once. */
export function motionPreference(): MotionPreference {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE_QUERY) : null;
  return query?.matches === true ? 'reduced' : 'full';
}

function translate(offset: MotionOffset | undefined): string {
  if (offset === undefined || offset.px === 0) return 'none';
  return `translate${offset.axis.toUpperCase()}(${String(offset.px)}px)`;
}

/**
 * Starts one Web Animation, or none under reduced motion or where the browser has no `animate`,
 * so callers never wait on an animation that does not exist.
 */
function play(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (motionPreference() === 'reduced' || typeof element.animate !== 'function') return null;
  return element.animate(keyframes, options);
}

async function settled(animation: Animation | null): Promise<void> {
  if (animation === null) return;
  await animation.finished.catch(() => undefined);
}

function enterFrames(offset: MotionOffset | undefined): Keyframe[] {
  if (offset === undefined) return [{ opacity: 0 }, { opacity: 1 }];
  return [
    { opacity: 0, transform: translate(offset) },
    { opacity: 1, transform: 'none' },
  ];
}

function exitFrames(offset: MotionOffset | undefined): Keyframe[] {
  if (offset === undefined) return [{ opacity: 1 }, { opacity: 0 }];
  return [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: translate(offset) },
  ];
}

function startEnter(element: Element, motion: LayerMotion): Animation | null {
  return play(element, enterFrames(motion.offset), {
    duration: motion.durationMs ?? MOTION_MS.medium,
    easing: MOTION_EASING.entry,
  });
}

function startExit(element: Element, motion: LayerMotion): Animation | null {
  return play(element, exitFrames(motion.offset), {
    duration: Math.min(motion.durationMs ?? MOTION_MS.small, MOTION_MS.small),
    easing: MOTION_EASING.exit,
    fill: 'forwards',
  });
}

/** A layer arrives: opacity in and an optional short slide, 250 ms on the entry curve. */
export async function enter(element: Element, motion: LayerMotion): Promise<void> {
  await settled(startEnter(element, motion));
}

/**
 * A layer leaves: opacity out and an optional short slide, 150 ms on the exit curve. The last
 * frame holds, so the caller can unmount once this resolves.
 */
export async function exit(element: Element, motion: LayerMotion): Promise<void> {
  await settled(startExit(element, motion));
}

/** A set arrives as one 150 ms opacity reveal on its container, with no stagger. */
export async function fadeIn(element: Element): Promise<void> {
  await settled(
    play(element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: MOTION_MS.small,
      easing: MOTION_EASING.entry,
      delay: 0,
    }),
  );
}

/**
 * FLIP: each element is already in its new place; it starts `fromPx` away and slides home over
 * 250 ms on the move curve. Elements that did not move get no animation. Returns how many moved.
 */
export function flip(moves: readonly FlipMove[]): number {
  const started = moves
    .filter((move) => move.fromPx !== 0)
    .map((move) =>
      play(
        move.element,
        [{ transform: `translateY(${String(move.fromPx)}px)` }, { transform: 'none' }],
        {
          duration: MOTION_MS.medium,
          easing: MOTION_EASING.move,
        },
      ),
    );
  return started.filter((animation) => animation !== null).length;
}

/**
 * One layer replaces another in the same slot: the outgoing one slides and fades over 150 ms
 * while the incoming one fades in over 250 ms, both starting in this call.
 */
export async function crossfade({ outgoing, incoming, offset }: CrossfadeParts): Promise<void> {
  const leaving = startExit(outgoing, { offset });
  const arriving = startEnter(incoming, { durationMs: MOTION_MS.medium });
  await Promise.all([settled(leaving), settled(arriving)]);
}

/** A success check: the short stroke fades in, then the long one, both done by 150 ms. */
export function drawCheck(shortStroke: Element, longStroke: Element): void {
  const frames: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
  const base = {
    duration: CHECK_STROKE_MS,
    easing: MOTION_EASING.entry,
    fill: 'backwards' as const,
  };
  play(shortStroke, frames, { ...base, delay: 0 });
  play(longStroke, frames, { ...base, delay: CHECK_STROKE_MS });
}
