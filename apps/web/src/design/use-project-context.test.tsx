import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { siteContextSchema } from '@parkshape/core';

import { useProjectContext } from './use-project-context';

const CONTEXT = siteContextSchema.parse({
  bufferM: 300,
  recordedAt: '2026-10-03T16:26:45.290Z',
  features: [],
});

describe('useProjectContext', () => {
  it('is loading, then ready with the context around the parcel', async () => {
    const api = { getContext: vi.fn().mockResolvedValue(CONTEXT) };
    const { result } = renderHook(() => useProjectContext(api, 'jrp'));
    expect(result.current).toEqual({ kind: 'loading' });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'ready', context: CONTEXT });
    });
    expect(api.getContext).toHaveBeenCalledWith('jrp');
  });

  it('is failed when the request fails, so the views draw the park alone', async () => {
    const api = { getContext: vi.fn().mockRejectedValue(new Error('down')) };
    const { result } = renderHook(() => useProjectContext(api, 'jrp'));
    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'failed' });
    });
  });

  it('fetches nothing for a view that shows no context', () => {
    const { result } = renderHook(() => useProjectContext(undefined, 'jrp'));
    expect(result.current).toEqual({ kind: 'loading' });
  });
});
