import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';
import { InMemoryRateLimitStore } from '@parkshape/db';

import { TokenBucketLimiter } from './rate-limit.js';

const MINUTE_MS = 60_000;

function limiter(capacity: number) {
  const clock = new FakeClock(new Date('2026-09-01T00:00:00Z'));
  const store = new InMemoryRateLimitStore();
  const options = { name: 'votes', capacity, windowMs: MINUTE_MS, clock, store };
  return { clock, bucket: new TokenBucketLimiter(options) };
}

async function kind(bucket: TokenBucketLimiter, key: string) {
  return (await bucket.take(key)).kind;
}

describe('TokenBucketLimiter', () => {
  it('allows a burst up to capacity, then limits with a retry time', async () => {
    const { bucket } = limiter(2);
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await bucket.take('u1')).toEqual({ kind: 'limited', retryAfterMs: MINUTE_MS / 2 });
  });

  it('gives a token back on refund, into the same bucket the take used', async () => {
    const { bucket } = limiter(1);
    await bucket.take('u1');
    await bucket.refund('u1');
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u1')).toBe('limited');
  });

  it('keeps a separate bucket per key', async () => {
    const { bucket } = limiter(1);
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u2')).toBe('allowed');
  });

  it('refills over time but never above capacity', async () => {
    const { bucket, clock } = limiter(2);
    await bucket.take('u1');
    await bucket.take('u1');
    clock.advance(MINUTE_MS / 2);
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u1')).toBe('limited');
    clock.advance(MINUTE_MS * 10);
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u1')).toBe('allowed');
    expect(await kind(bucket, 'u1')).toBe('limited');
  });

  it('shares one count between two limiters over one store, as two instances would', async () => {
    const clock = new FakeClock(new Date('2026-09-01T00:00:00Z'));
    const store = new InMemoryRateLimitStore();
    const options = { name: 'votes', capacity: 2, windowMs: MINUTE_MS, clock, store };
    const first = new TokenBucketLimiter(options);
    const second = new TokenBucketLimiter(options);
    expect(await kind(first, 'u1')).toBe('allowed');
    expect(await kind(second, 'u1')).toBe('allowed');
    expect(await kind(first, 'u1')).toBe('limited');
  });

  it('keeps actions apart in one store by prefixing the key with the action name', async () => {
    const clock = new FakeClock(new Date('2026-09-01T00:00:00Z'));
    const store = new InMemoryRateLimitStore();
    const shared = { capacity: 1, windowMs: MINUTE_MS, clock, store };
    const votes = new TokenBucketLimiter({ ...shared, name: 'votes' });
    const saves = new TokenBucketLimiter({ ...shared, name: 'draftSaves' });
    expect(await kind(votes, 'u1')).toBe('allowed');
    expect(await kind(saves, 'u1')).toBe('allowed');
  });
});
