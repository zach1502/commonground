import { describe, expect, it } from 'vitest';

import type { RateLimitStore, TakeOptions } from '../rate-limit-store.js';

export type RateLimitStoreFactory = () => Promise<RateLimitStore>;

const MINUTE_MS = 60_000;
const START_MS = Date.parse('2026-09-01T12:00:00.000Z');
const PARALLEL_TAKES = 50;
const PARALLEL_CAPACITY = 10;

function at(capacity: number, offsetMs = 0): TakeOptions {
  return { capacity, windowMs: MINUTE_MS, nowMs: START_MS + offsetMs };
}

async function kinds(store: RateLimitStore, key: string, options: TakeOptions, count: number) {
  const results: string[] = [];
  for (let taken = 0; taken < count; taken += 1) {
    results.push((await store.take(key, options)).kind);
  }
  return results;
}

/** Behaviour every RateLimitStore adapter must have: the refill rules of a token bucket. */
export function rateLimitStoreContract(name: string, factory: RateLimitStoreFactory): void {
  describe(`${name} meets the RateLimitStore contract`, () => {
    bucketContract(factory);
    refundContract(factory);
  });
}

/** Takes, refills and parallel takes on one bucket. */
function bucketContract(factory: RateLimitStoreFactory): void {
  it('allows a burst up to capacity, then limits', async () => {
    const store = await factory();
    expect(await kinds(store, 'u1', at(3), 4)).toEqual([
      'allowed',
      'allowed',
      'allowed',
      'limited',
    ]);
  });

  it('returns the wait until one token is back', async () => {
    const store = await factory();
    await kinds(store, 'u1', at(2), 2);
    expect(await store.take('u1', at(2))).toEqual({
      kind: 'limited',
      retryAfterMs: MINUTE_MS / 2,
    });
    expect(await store.take('u1', at(2, MINUTE_MS / 4))).toEqual({
      kind: 'limited',
      retryAfterMs: MINUTE_MS / 4,
    });
  });

  it('refills over time from nowMs but never above capacity', async () => {
    const store = await factory();
    await kinds(store, 'u1', at(2), 2);
    expect(await kinds(store, 'u1', at(2, MINUTE_MS / 2), 2)).toEqual(['allowed', 'limited']);
    const muchLater = at(2, MINUTE_MS * 10);
    expect(await kinds(store, 'u1', muchLater, 3)).toEqual(['allowed', 'allowed', 'limited']);
  });

  it('keeps a separate bucket per key', async () => {
    const store = await factory();
    expect((await store.take('u1', at(1))).kind).toBe('allowed');
    expect((await store.take('u2', at(1))).kind).toBe('allowed');
    expect((await store.take('u1', at(1))).kind).toBe('limited');
  });

  it('neither drains nor rewinds a bucket when a take reports an earlier nowMs', async () => {
    const store = await factory();
    await store.take('u1', at(2, MINUTE_MS));
    expect((await store.take('u1', at(2))).kind).toBe('allowed');
    expect(await store.take('u1', at(2, MINUTE_MS + MINUTE_MS / 4))).toEqual({
      kind: 'limited',
      retryAfterMs: MINUTE_MS / 4,
    });
  });

  it('allows exactly capacity takes when 50 run at once on one key', async () => {
    const store = await factory();
    const results = await Promise.all(
      Array.from({ length: PARALLEL_TAKES }, () => store.take('burst', at(PARALLEL_CAPACITY))),
    );
    const allowed = results.filter((result) => result.kind === 'allowed');
    expect(allowed).toHaveLength(PARALLEL_CAPACITY);
  });
}

/** A refund returns a spent token and never fills a bucket past capacity. */
function refundContract(factory: RateLimitStoreFactory): void {
  it('gives back one token on refund, so the next take is allowed', async () => {
    const store = await factory();
    await kinds(store, 'u1', at(2), 2);
    await store.refund('u1', at(2));
    expect(await kinds(store, 'u1', at(2), 2)).toEqual(['allowed', 'limited']);
  });

  it('never refunds a bucket above capacity', async () => {
    const store = await factory();
    await store.refund('fresh', at(2));
    await store.take('u1', at(2));
    await store.refund('u1', at(2));
    await store.refund('u1', at(2));
    expect(await kinds(store, 'fresh', at(2), 3)).toEqual(['allowed', 'allowed', 'limited']);
    expect(await kinds(store, 'u1', at(2), 3)).toEqual(['allowed', 'allowed', 'limited']);
  });
}
