import type { Cache } from '../../ports/cache.js';

const DEFAULT_MAX_ENTRIES = 500;

export interface MemoryCacheOptions {
  readonly maxEntries?: number;
}

/** An in-process cache that forgets its oldest entry once full. Lost on restart. */
export class MemoryCache implements Cache {
  readonly #entries = new Map<string, unknown>();
  readonly #maxEntries: number;

  constructor(options: MemoryCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.#entries.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    if (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done !== true) this.#entries.delete(oldest.value);
    }
    return Promise.resolve();
  }
}
