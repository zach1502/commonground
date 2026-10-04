import {
  limitedResult,
  refilledTokens,
  type RateLimitStore,
  type StoredBucket,
  type TakeOptions,
  type TakeResult,
} from '../../ports/rate-limit-store.js';

/** Buckets in a Map: they last as long as the process, so each API instance counts alone. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, StoredBucket>();

  take(key: string, options: TakeOptions): Promise<TakeResult> {
    return Promise.resolve(this.spend(key, options));
  }

  refund(key: string, options: TakeOptions): Promise<void> {
    const stored = this.buckets.get(key);
    if (stored !== undefined) {
      const tokens = Math.min(options.capacity, refilledTokens(stored, options) + 1);
      this.buckets.set(key, { tokens, updatedMs: Math.max(stored.updatedMs, options.nowMs) });
    }
    return Promise.resolve();
  }

  private spend(key: string, options: TakeOptions): TakeResult {
    const stored = this.buckets.get(key);
    const tokens = refilledTokens(stored, options);
    const updatedMs = Math.max(stored?.updatedMs ?? options.nowMs, options.nowMs);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedMs });
      return limitedResult(tokens, options);
    }
    this.buckets.set(key, { tokens: tokens - 1, updatedMs });
    return { kind: 'allowed' };
  }
}
