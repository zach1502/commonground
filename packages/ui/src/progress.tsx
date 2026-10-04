import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { classNames } from './class-names.js';
import { drawCheck, MOTION_CLASS, PROGRESS_DELAY_MS } from './motion/index.js';

/** True once `delayMs` has passed since mount. */
function useAfter(delayMs: number): 'due' | 'early' {
  const [due, setDue] = useState<'due' | 'early'>('early');
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDue('due');
    }, delayMs);
    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs]);
  return due;
}

/**
 * A bar with no percent for a wait with no known end, such as a submit. It shows only after 1 s,
 * so a fast answer shows nothing new, and its bar is the app's one looping motion.
 */
export function IndeterminateProgress({ label }: { readonly label: string }) {
  if (useAfter(PROGRESS_DELAY_MS) === 'early') return null;
  return (
    <div className="ps-progress" role="progressbar" aria-label={label}>
      <span className={classNames('ps-progress__bar', MOTION_CLASS.progress)} />
    </div>
  );
}

/** A check drawn as two strokes that fade in one after the other, short first, by 150 ms. */
export function SuccessCheck({ className }: { readonly className?: string }) {
  const short = useRef<SVGPathElement>(null);
  const long = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    if (short.current !== null && long.current !== null) drawCheck(short.current, long.current);
  }, []);
  return (
    <svg
      className={classNames('ps-success-check', className)}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path ref={short} d="M4 10.5 8 14.5" />
      <path ref={long} d="M8 14.5 16 5.5" />
    </svg>
  );
}
