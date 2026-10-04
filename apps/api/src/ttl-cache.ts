import type { Clock } from '@parkshape/core';

export interface TtlCacheOptions {
  readonly clock: Clock;
  readonly ttlMs: number;
}

interface Entry<T> {
  readonly storedAtMs: number;
  readonly value: Promise<T>;
}

/** Keeps one computed value per key for a short time, timed by the injected clock. */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly options: TtlCacheOptions) {}

  /** The cached value, or a fresh one from compute; concurrent callers share one computation. */
  get(key: string, compute: () => Promise<T>): Promise<T> {
    const now = this.options.clock.now().getTime();
    const entry = this.entries.get(key);
    if (entry !== undefined && now - entry.storedAtMs <= this.options.ttlMs) return entry.value;
    const value = compute();
    this.entries.set(key, { storedAtMs: now, value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  /** Drops the key's value, so the next get computes it again. */
  invalidate(key: string): void {
    this.entries.delete(key);
  }
}
