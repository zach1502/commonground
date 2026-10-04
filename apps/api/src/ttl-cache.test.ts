import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  it('reuses a value until it is older than the time to live', async () => {
    const clock = new FakeClock(new Date('2026-09-25T09:00:00.000Z'));
    const cache = new TtlCache<number>({ clock, ttlMs: 5000 });
    let computed = 0;
    const compute = () => {
      computed += 1;
      return Promise.resolve(computed);
    };
    expect(await cache.get('p1', compute)).toBe(1);
    clock.advance(5000);
    expect(await cache.get('p1', compute)).toBe(1);
    expect(await cache.get('p2', compute)).toBe(2);
    clock.advance(1);
    expect(await cache.get('p1', compute)).toBe(3);
  });

  it('does not keep a failed computation', async () => {
    const clock = new FakeClock(new Date('2026-09-25T09:00:00.000Z'));
    const cache = new TtlCache<number>({ clock, ttlMs: 5000 });
    await expect(cache.get('p1', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get('p1', () => Promise.resolve(7))).toBe(7);
  });

  it('computes again after the key is invalidated', async () => {
    const clock = new FakeClock(new Date('2026-09-25T09:00:00.000Z'));
    const cache = new TtlCache<number>({ clock, ttlMs: 5000 });
    expect(await cache.get('p1', () => Promise.resolve(1))).toBe(1);
    cache.invalidate('p1');
    expect(await cache.get('p1', () => Promise.resolve(2))).toBe(2);
  });
});
