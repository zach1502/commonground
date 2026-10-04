import { describe, expect, it } from 'vitest';

import { cacheContract } from '../../ports/__contracts__/cache.contract.js';

import { MemoryCache } from './memory-cache.js';

cacheContract('MemoryCache', () => new MemoryCache());

describe('MemoryCache', () => {
  it('forgets the oldest entry once it holds maxEntries', async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('c')).toBe(3);
  });
});
