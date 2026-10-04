/** One take from a bucket: the bucket's size, how long a full refill takes, and the time now. */
export interface TakeOptions {
  /** Most requests allowed in a burst, and per window on average. */
  readonly capacity: number;
  readonly windowMs: number;
  readonly nowMs: number;
}

export type TakeResult =
  { readonly kind: 'allowed' } | { readonly kind: 'limited'; readonly retryAfterMs: number };

/**
 * Token buckets keyed by string that refill continuously. A shared adapter lets every API
 * instance count against the same buckets, so a limit holds across Vercel function instances.
 */
export interface RateLimitStore {
  take(key: string, options: TakeOptions): Promise<TakeResult>;
  /**
   * Gives back one token that an allowed take spent, never filling past capacity. A caller
   * refunds when the action it took the token for did not happen, so a failed try is free.
   */
  refund(key: string, options: TakeOptions): Promise<void>;
}

export interface StoredBucket {
  readonly tokens: number;
  readonly updatedMs: number;
}

/** Tokens per millisecond; a full bucket refills over one window. */
export function refillPerMs(options: TakeOptions): number {
  return options.capacity / options.windowMs;
}

/**
 * The bucket's tokens at nowMs, never above capacity. A missing bucket starts full. A nowMs
 * before the stored time adds nothing, so a slow clock on another instance cannot drain it.
 */
export function refilledTokens(bucket: StoredBucket | undefined, options: TakeOptions): number {
  if (bucket === undefined) {
    return options.capacity;
  }
  const elapsedMs = Math.max(0, options.nowMs - bucket.updatedMs);
  return Math.min(options.capacity, bucket.tokens + elapsedMs * refillPerMs(options));
}

/** The wait until a bucket holding fewer than 1 token holds 1 again; at least 1 ms. */
export function limitedResult(tokens: number, options: TakeOptions): TakeResult {
  const waitMs = Math.ceil((1 - tokens) / refillPerMs(options));
  return { kind: 'limited', retryAfterMs: Math.max(1, waitMs) };
}
