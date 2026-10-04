import type { Clock } from '@parkshape/core';
import type { RateLimitStore, TakeResult } from '@parkshape/db';

export type { TakeResult } from '@parkshape/db';

export interface TokenBucketOptions {
  /** The limited action; it prefixes every key so actions sharing one store stay apart. */
  readonly name: string;
  /** Most requests allowed in a burst, and per window on average. */
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock: Clock;
  /** Where the buckets live; a shared store makes the limit hold across API instances. */
  readonly store: RateLimitStore;
}

/** Per-key token buckets that refill continuously; one instance per limited action. */
export class TokenBucketLimiter {
  constructor(private readonly options: TokenBucketOptions) {}

  take(key: string): Promise<TakeResult> {
    return this.options.store.take(this.bucketKey(key), this.takeOptions());
  }

  /** Gives back the token a take spent, for an action that did not happen. */
  refund(key: string): Promise<void> {
    return this.options.store.refund(this.bucketKey(key), this.takeOptions());
  }

  private bucketKey(key: string): string {
    return `${this.options.name}:${key}`;
  }

  private takeOptions() {
    const { capacity, windowMs, clock } = this.options;
    return { capacity, windowMs, nowMs: clock.now().getTime() };
  }
}
