import { describe, expect, it } from 'vitest';

import type { Cache } from '../cache.js';

/** Behaviour every Cache adapter must have. Each adapter test calls this with a factory. */
export function cacheContract(name: string, makeCache: () => Cache): void {
  describe(`${name} meets the Cache contract`, () => {
    it('misses on a key it never stored', async () => {
      expect(await makeCache().get('summary:missing')).toBeUndefined();
    });

    it('returns an equal value for a stored key', async () => {
      const cache = makeCache();
      await cache.set('summary:one', { themes: [], tradeoffs: [] });
      expect(await cache.get('summary:one')).toEqual({ themes: [], tradeoffs: [] });
    });

    it('replaces the value when a key is stored again', async () => {
      const cache = makeCache();
      await cache.set('intent:one', 1);
      await cache.set('intent:one', 2);
      expect(await cache.get('intent:one')).toBe(2);
    });
  });
}
