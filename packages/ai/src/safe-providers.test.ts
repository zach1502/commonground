import { describe, expect, it } from 'vitest';

import { MemoryCache } from './adapters/memory/memory-cache.js';
import { RuleBasedIntentProvider } from './adapters/rule-based/intent.js';
import { RuleBasedSummaryProvider } from './adapters/rule-based/summary.js';
import type { Sourced } from './answer-source.js';
import { intentProviderContract } from './ports/__contracts__/intent-provider.contract.js';
import { SUMMARY_INPUT } from './ports/__contracts__/summary-fixtures.js';
import { summaryProviderContract } from './ports/__contracts__/summary-provider.contract.js';
import type { IntentProvider } from './ports/intent-provider.js';
import type { SummaryProvider } from './ports/summary-provider.js';
import { SafeIntentProvider, SafeSummaryProvider } from './safe-providers.js';
import type { Intent } from './schema/intent.js';
import type { Summary } from './schema/summary.js';

summaryProviderContract(
  'SafeSummaryProvider',
  () =>
    new SafeSummaryProvider({ inner: new RuleBasedSummaryProvider(), cache: new MemoryCache() }),
);
intentProviderContract(
  'SafeIntentProvider',
  () => new SafeIntentProvider({ inner: new RuleBasedIntentProvider(), cache: new MemoryCache() }),
);

class CountingSummary implements SummaryProvider {
  calls = 0;
  constructor(private readonly answer: Sourced<Summary>) {}
  summarize(): Promise<Sourced<Summary>> {
    this.calls += 1;
    return Promise.resolve(this.answer);
  }
}

class CountingIntent implements IntentProvider {
  calls = 0;
  constructor(private readonly answer: Sourced<Intent>) {}
  parse(): Promise<Sourced<Intent>> {
    this.calls += 1;
    return Promise.resolve(this.answer);
  }
}

const SEEDED: Summary = {
  themes: [
    { label: 'Robust shade', designCount: 1, exampleDesignId: 'design-a' },
    { label: 'A tapestry of paths', designCount: 1, exampleDesignId: 'design-a' },
  ],
  tradeoffs: [],
};
const EMPTY: Summary = { themes: [], tradeoffs: [] };
const fromModel = <T>(value: T) => ({ source: 'model', model: 'test-model', value }) as const;
const fromRules = <T>(value: T) => ({ source: 'rule-based', value }) as const;

describe('SafeSummaryProvider', () => {
  it('filters banned words out of whatever the inner provider returns', async () => {
    const provider = new SafeSummaryProvider({
      inner: new CountingSummary(fromModel(SEEDED)),
      cache: new MemoryCache(),
    });
    expect((await provider.summarize(SUMMARY_INPUT)).value.themes).toEqual([
      { label: 'Strong shade', designCount: 1, exampleDesignId: 'design-a' },
    ]);
  });

  it('keeps who wrote the answer, on a fresh answer and on a cached one', async () => {
    const provider = new SafeSummaryProvider({
      inner: new CountingSummary(fromModel(EMPTY)),
      cache: new MemoryCache(),
    });
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fromModel(EMPTY));
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fromModel(EMPTY));
  });

  it('asks the inner provider once per distinct input', async () => {
    const inner = new CountingSummary(fromModel(EMPTY));
    const provider = new SafeSummaryProvider({ inner, cache: new MemoryCache() });
    await provider.summarize(SUMMARY_INPUT);
    await provider.summarize({ ...SUMMARY_INPUT });
    await provider.summarize({ ...SUMMARY_INPUT, reasonCounts: {} });
    expect(inner.calls).toBe(2);
  });

  it('does not cache a rules answer, so the next request asks the model again', async () => {
    const inner = new CountingSummary(fromRules(EMPTY));
    const provider = new SafeSummaryProvider({ inner, cache: new MemoryCache() });
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fromRules(EMPTY));
    await provider.summarize(SUMMARY_INPUT);
    expect(inner.calls).toBe(2);
  });

  it('ignores a cached value that no longer validates', async () => {
    const cache = new MemoryCache();
    const inner = new CountingSummary(fromModel(EMPTY));
    const provider = new SafeSummaryProvider({ inner, cache });
    await provider.summarize(SUMMARY_INPUT);
    await cache.set(provider.keyFor(SUMMARY_INPUT), { themes: 'broken' });
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fromModel(EMPTY));
    expect(inner.calls).toBe(2);
  });
});

describe('SafeIntentProvider', () => {
  const intent: Intent = {
    features: [{ category: 'play', count: 1, placement: { near: 'the vibrant plaza' } }],
    paths: { style: 'loop' },
    canopy: 'add-some',
    character: 'active',
  };

  it('caches by text, ignoring case and extra spaces, and filters place names', async () => {
    const inner = new CountingIntent(fromModel(intent));
    const provider = new SafeIntentProvider({ inner, cache: new MemoryCache() });
    const first = await provider.parse('A playground');
    const again = await provider.parse('  a   playground ');
    expect(inner.calls).toBe(1);
    expect(first.value.features[0]?.placement).toEqual({ near: 'the plaza' });
    expect(again).toMatchObject({ source: 'model', model: 'test-model' });
  });

  it('does not cache a rules reading, so the next request asks the model again', async () => {
    const inner = new CountingIntent(fromRules(intent));
    const provider = new SafeIntentProvider({ inner, cache: new MemoryCache() });
    expect((await provider.parse('A playground')).source).toBe('rule-based');
    await provider.parse('A playground');
    expect(inner.calls).toBe(2);
  });
});
