import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { classNames } from './class-names.js';
import { fadeIn } from './motion/index.js';
import { VisuallyHidden } from './visually-hidden.js';

/** Loads under 1 s show nothing new; only a longer wait gets a skeleton. */
export const SKELETON_DELAY_MS = 1000;

export type SkeletonShape = 'heading' | 'line' | 'button' | 'row' | 'thumb' | 'card' | 'poster';

export interface SkeletonProps {
  /** What is loading, read by screen readers, such as "Loading the leaderboard". */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly delayMs?: number;
  /**
   * "status" makes the skeleton a live status region. "quiet" suits a page that already has a
   * status line, such as the vote progress, so the page keeps one.
   */
  readonly announce?: 'status' | 'quiet';
}

/** True once `delayMs` has passed since the first render; at once when no wait is left. */
function useElapsed(delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return undefined;
    const handle = window.setTimeout(() => {
      setElapsed(true);
    }, delayMs);
    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs]);
  return elapsed;
}

/**
 * Static grey blocks shaped like the final layout. They appear only after 1 s, so a fast load
 * shows nothing new, and they never shimmer.
 */
export function Skeleton({
  label,
  children,
  className,
  delayMs = SKELETON_DELAY_MS,
  announce = 'status',
}: SkeletonProps) {
  const elapsed = useElapsed(delayMs);
  return (
    <div
      className={classNames('ps-skeleton', className)}
      {...(announce === 'status' ? { role: 'status' } : {})}
      aria-busy="true"
    >
      {elapsed ? (
        <>
          <VisuallyHidden>{label}</VisuallyHidden>
          {children}
        </>
      ) : null}
    </div>
  );
}

/** One grey block, sized by its shape in components.css. */
export function SkeletonBlock({ shape }: { readonly shape: SkeletonShape }) {
  return (
    <span
      className={classNames('ps-skeleton__block', `ps-skeleton__block--${shape}`)}
      aria-hidden="true"
    />
  );
}

export interface SkeletonRevealProps {
  /** 'waiting' hides the content while the skeleton beside it holds its place. */
  readonly state: 'waiting' | 'ready';
  /**
   * 'fade' reveals the content over 150 ms when the wait ends; 'instant' suits a route whose first
   * paint is its LCP element, such as the vote route. Read while waiting, so the value for the
   * page that was loading is the one used.
   */
  readonly reveal: 'fade' | 'instant';
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * The slot that a skeleton stands in for. After a wait it fades its content in once, in the same
 * place, so nothing shifts; content that never waited appears with no motion.
 */
export function SkeletonReveal({ state, reveal, className, children }: SkeletonRevealProps) {
  const slot = useRef<HTMLDivElement>(null);
  const pending = useRef<'fade' | 'instant' | null>(null);
  if (state === 'waiting') pending.current = reveal;
  useLayoutEffect(() => {
    if (state !== 'ready' || pending.current === null) return;
    const kind = pending.current;
    pending.current = null;
    if (kind === 'fade' && slot.current !== null) void fadeIn(slot.current);
  }, [state]);
  return (
    <div ref={slot} className={className} hidden={state === 'waiting'}>
      {children}
    </div>
  );
}
