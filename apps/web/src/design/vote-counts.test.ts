import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Design } from '../api/web-api';

import { useVoteCounts } from './vote-counts';

const design = (id: string, up: number, down: number) => ({ id, up, down }) as unknown as Design;

describe('useVoteCounts (owner check 9)', () => {
  it('shows the loaded counts, then the counts after a vote', () => {
    const { result } = renderHook(() => useVoteCounts(design('d1', 6, 5)));
    expect(result.current.shown).toMatchObject({ id: 'd1', up: 6, down: 5 });
    act(() => {
      result.current.update({ up: 7, down: 5 });
    });
    expect(result.current.shown).toMatchObject({ id: 'd1', up: 7, down: 5 });
  });

  it('goes back to the loaded counts for another design', () => {
    const { result, rerender } = renderHook(({ shown }) => useVoteCounts(shown), {
      initialProps: { shown: design('d1', 6, 5) },
    });
    act(() => {
      result.current.update({ up: 7, down: 5 });
    });
    rerender({ shown: design('d2', 1, 2) });
    expect(result.current.shown).toMatchObject({ id: 'd2', up: 1, down: 2 });
  });
});
