import { describe, expect, it } from 'vitest';

import { contentProblems } from '../../filter.js';
import { SUMMARY_INPUT } from '../../ports/__contracts__/summary-fixtures.js';
import { summaryProviderContract } from '../../ports/__contracts__/summary-provider.contract.js';
import { MAX_LABEL_CHARS } from '../../schema/summary.js';
import type { SummaryInput } from '../../types.js';

import phraseBank from './phrase-bank.json' with { type: 'json' };
import { RuleBasedSummaryProvider } from './summary.js';

summaryProviderContract('RuleBasedSummaryProvider', () => new RuleBasedSummaryProvider());

const rules = new RuleBasedSummaryProvider();
// The cases below check the summary itself, so they look at the answer's value only.
const provider = {
  summarize: async (input: SummaryInput) => (await rules.summarize(input)).value,
};

describe('RuleBasedSummaryProvider', () => {
  it('says the fixed rules wrote the summary', async () => {
    expect(await rules.summarize(SUMMARY_INPUT)).toMatchObject({ source: 'rule-based' });
  });

  it('matches the snapshot for the fixture designs', async () => {
    expect(await provider.summarize(SUMMARY_INPUT)).toMatchSnapshot();
  });

  it('counts the designs that use each theme and names the one that uses it most', async () => {
    const { themes } = await provider.summarize(SUMMARY_INPUT);
    expect(themes.find(({ label }) => label === phraseBank.themes.tree)).toEqual({
      label: phraseBank.themes.tree,
      designCount: 3,
      exampleDesignId: 'design-a',
    });
  });

  it('counts only the designs that have a feature, never the size of the top list', async () => {
    const topDesigns = Array.from({ length: 10 }, (_, index) => ({
      id: `d${String(index)}`,
      score: 1 - index / 10,
      categoryCounts: index < 3 ? { water: 1, path: 1 } : { path: 1 },
    }));
    const { themes } = await provider.summarize({ ...SUMMARY_INPUT, topDesigns });
    expect(themes.find(({ label }) => label === phraseBank.themes.water)?.designCount).toBe(3);
    expect(themes.find(({ label }) => label === phraseBank.themes.path)?.designCount).toBe(10);
  });

  it('omits a tradeoff whose split names fewer designs than the suppression threshold', async () => {
    // The fixture's four top designs split trees against play, but too few to state.
    const { tradeoffs } = await provider.summarize(SUMMARY_INPUT);
    expect(tradeoffs).toEqual([]);
  });

  it('orders equal themes by how often voters gave the matching reason', async () => {
    const input = {
      ...SUMMARY_INPUT,
      topDesigns: [
        { id: 'one', score: 0.5, categoryCounts: { play: 1, garden: 1 } },
        { id: 'two', score: 0.4, categoryCounts: { play: 1, garden: 1 } },
      ],
      reasonCounts: { garden: 5, play: 1 },
    };
    const { themes } = await provider.summarize(input);
    expect(themes.map(({ label }) => label)).toEqual([
      phraseBank.themes.garden,
      phraseBank.themes.play,
    ]);
  });

  it('has a phrase bank that passes the content rules', () => {
    const phrases = [...Object.values(phraseBank.themes), ...Object.values(phraseBank.sides)];
    expect(phrases.flatMap(contentProblems)).toEqual([]);
  });
});

describe('RuleBasedSummaryProvider tradeoffs', () => {
  it('states a tradeoff with its n once enough designs lean each way', async () => {
    const only = (category: 'water' | 'play') => ({ [category]: 1 }) as Record<string, number>;
    const topDesigns = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `w${String(index)}`,
        score: 1,
        categoryCounts: only('water'),
      })),
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `p${String(index)}`,
        score: 1,
        categoryCounts: only('play'),
      })),
    ];
    const { tradeoffs } = await provider.summarize({ ...SUMMARY_INPUT, topDesigns });
    expect(tradeoffs).toContainEqual({ a: 'More water', b: 'More play', leanA: 12, chose: 21 });
  });
});

describe('RuleBasedSummaryProvider comment line', () => {
  const withFeedback = (comments: number, label: string) => ({
    ...SUMMARY_INPUT,
    elementFeedback: { comments, topElements: [{ label, comments }] },
  });

  it('says comment, not comments, for a single comment', async () => {
    const { commentLine } = await provider.summarize(withFeedback(1, 'Bench'));
    expect(commentLine).toBe('1 comment on elements, most on Bench');
  });

  it('drops the element name when the line would pass the label budget', async () => {
    const long = 'Picnic table with a shade sail and a bike rack beside it, north-east';
    const { commentLine } = await provider.summarize(withFeedback(12, long));
    expect(commentLine).toBe('12 comments on elements');
    expect(commentLine?.length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
  });
});
