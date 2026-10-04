import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Insights } from '../../api/staff-api';

import { useInsights } from './use-insights';

const INTERVAL_MS = 5000;
const INITIAL = { headline: { designsSubmitted: 1 } } as unknown as Insights;
const FRESH = { headline: { designsSubmitted: 2 } } as unknown as Insights;

describe('useInsights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for a slow refresh to finish before it asks again', async () => {
    let finish: (value: Insights) => void = () => undefined;
    const getInsights = vi.fn(
      () =>
        new Promise<Insights>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useInsights({ getInsights }, 'jrp', INITIAL, INTERVAL_MS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    });
    expect(getInsights).toHaveBeenCalledOnce();
    await act(async () => {
      finish(FRESH);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(FRESH);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    });
    expect(getInsights).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a failed refresh', async () => {
    const getInsights = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(FRESH);
    const { result } = renderHook(() => useInsights({ getInsights }, 'jrp', INITIAL, INTERVAL_MS));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
    });
    expect(getInsights).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(FRESH);
  });
});
