import type { z } from 'zod';

import { modelAnswerSchema, withValue, type Sourced } from './answer-source.js';
import { cacheKey } from './cache-key.js';
import { filterIntent, filterSummary } from './filter.js';
import type { Cache } from './ports/cache.js';
import type { IntentProvider } from './ports/intent-provider.js';
import type { SummaryProvider } from './ports/summary-provider.js';
import { intentSchema, type Intent } from './schema/intent.js';
import { summarySchema, type Summary } from './schema/summary.js';
import type { SummaryInput } from './types.js';

interface SafeDeps<P> {
  readonly inner: P;
  readonly cache: Cache;
}

/**
 * The cached model answer for `key`, or a fresh answer. Only model answers are stored. A rules
 * answer is what a failed model call falls back to, and storing it would keep it in place of
 * the model's until restart. The Cache port has no expiry, so a short TTL would need a new port;
 * the rules run in-process and cost little to run again. While the model is down, each request
 * waits for it to fail again before the rules answer.
 */
async function cached<T>(
  cache: Cache,
  key: string,
  schema: z.ZodType<T>,
  compute: () => Promise<Sourced<T>>,
): Promise<Sourced<T>> {
  const hit = modelAnswerSchema(schema).safeParse(await cache.get(key));
  if (hit.success) {
    return hit.data;
  }
  const fresh = await compute();
  if (fresh.source === 'model') {
    await cache.set(key, fresh);
  }
  return fresh;
}

/** Filters every label through the content rules and caches model answers per input hash. */
export class SafeSummaryProvider implements SummaryProvider {
  readonly #deps: SafeDeps<SummaryProvider>;

  constructor(deps: SafeDeps<SummaryProvider>) {
    this.#deps = deps;
  }

  keyFor(input: SummaryInput): string {
    return cacheKey('summary', input);
  }

  summarize(input: SummaryInput): Promise<Sourced<Summary>> {
    const { cache, inner } = this.#deps;
    return cached(cache, this.keyFor(input), summarySchema, async () => {
      const answer = await inner.summarize(input);
      return withValue(answer, filterSummary(answer.value));
    });
  }
}

function normalizeDescription(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Filters place names through the content rules and caches model readings per text hash. */
export class SafeIntentProvider implements IntentProvider {
  readonly #deps: SafeDeps<IntentProvider>;

  constructor(deps: SafeDeps<IntentProvider>) {
    this.#deps = deps;
  }

  parse(text: string): Promise<Sourced<Intent>> {
    const { cache, inner } = this.#deps;
    const description = normalizeDescription(text);
    return cached(cache, cacheKey('intent', description), intentSchema, async () => {
      const answer = await inner.parse(description);
      return withValue(answer, filterIntent(answer.value));
    });
  }
}
