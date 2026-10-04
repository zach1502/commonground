import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRetryAfter } from './use-retry-after';

describe('useRetryAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unblocked', () => {
    const { result } = renderHook(() => useRetryAfter());
    expect(result.current.isBlocked).toBe(false);
  });

  it('blocks for the given seconds and re-enables when the window passes', () => {
    const { result } = renderHook(() => useRetryAfter());
    act(() => {
      result.current.block(30);
    });
    expect(result.current.isBlocked).toBe(true);
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current.isBlocked).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.isBlocked).toBe(false);
  });

  it('treats a zero or negative wait as unblocked', () => {
    const { result } = renderHook(() => useRetryAfter());
    act(() => {
      result.current.block(0);
    });
    expect(result.current.isBlocked).toBe(false);
  });
});
