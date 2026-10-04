import { useCallback, useEffect, useRef, useState } from 'react';

const MS_PER_SECOND = 1000;

export interface RetryAfter {
  /** True while a rate-limit window is still open, so the primary action stays disabled. */
  readonly isBlocked: boolean;
  /** Starts a wait of the given seconds; a zero or negative wait leaves the action usable. */
  readonly block: (seconds: number) => void;
}

/**
 * Holds a primary action disabled for the seconds a 429 asked for, then re-enables it on time.
 * One timer runs at a time; a new block replaces the old. Tests drive it with a fake clock.
 */
export function useRetryAfter(): RetryAfter {
  const [isBlocked, setBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const block = useCallback((seconds: number) => {
    clear();
    if (seconds <= 0) {
      setBlocked(false);
      return;
    }
    setBlocked(true);
    timer.current = setTimeout(() => {
      setBlocked(false);
    }, seconds * MS_PER_SECOND);
  }, []);
  useEffect(() => clear, []);
  return { isBlocked, block };
}
