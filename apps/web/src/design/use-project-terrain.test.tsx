import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { useProjectTerrain } from './use-project-terrain';

const RAMP = makeRampHeightmap({ width: 4, height: 4, gradeY: 0.3 });

describe('useProjectTerrain', () => {
  it('waits, then hands over the terrain the server measures on', async () => {
    const api = { getTerrain: vi.fn().mockResolvedValue(RAMP) };
    const { result } = renderHook(() => useProjectTerrain(api, 'jrp'));
    expect(result.current.state).toBe('loading');
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
    expect(api.getTerrain).toHaveBeenCalledWith('jrp');
    expect(result.current).toEqual({ state: 'ready', heightmap: RAMP });
  });

  it('is ready with no terrain when the request fails, so the view draws flat ground', async () => {
    const api = { getTerrain: vi.fn().mockRejectedValue(new Error('down')) };
    const { result } = renderHook(() => useProjectTerrain(api, 'jrp'));
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
    expect(result.current).toEqual({ state: 'ready', heightmap: undefined });
  });
});
