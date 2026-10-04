import { describe, expect, it, vi } from 'vitest';

import type { Design } from '../../api/web-api';

import { prefetchDesign, withPrefetchedDesign } from './prefetch';

const DESIGN = { id: 'd1' } as unknown as Design;
const OTHER = { id: 'd2' } as unknown as Design;

describe('prefetchDesign', () => {
  it('starts nothing for an empty queue', () => {
    const getDesign = vi.fn();
    expect(prefetchDesign({ getDesign }, undefined)).toBeNull();
    expect(getDesign).not.toHaveBeenCalled();
  });

  it('starts the request for the given design', async () => {
    const getDesign = vi.fn().mockResolvedValue(DESIGN);
    const prefetched = prefetchDesign({ getDesign }, 'd1');
    expect(prefetched?.id).toBe('d1');
    expect(await prefetched?.design).toBe(DESIGN);
  });
});

describe('withPrefetchedDesign', () => {
  it('answers the prefetched id from the request already made', async () => {
    const getDesign = vi.fn().mockResolvedValue(OTHER);
    const api = withPrefetchedDesign({ getDesign }, { id: 'd1', design: Promise.resolve(DESIGN) });
    expect(await api.getDesign('d1')).toBe(DESIGN);
    expect(getDesign).not.toHaveBeenCalled();
    expect(await api.getDesign('d2')).toBe(OTHER);
  });

  it('asks again when the early request failed', async () => {
    const getDesign = vi.fn().mockResolvedValue(DESIGN);
    const failed = { id: 'd1', design: Promise.reject(new Error('offline')) };
    const api = withPrefetchedDesign({ getDesign }, failed);
    expect(await api.getDesign('d1')).toBe(DESIGN);
    expect(getDesign).toHaveBeenCalledWith('d1');
  });

  it('passes the api through when nothing was prefetched', () => {
    const base = { getDesign: vi.fn() };
    expect(withPrefetchedDesign(base, null)).toBe(base);
  });
});
