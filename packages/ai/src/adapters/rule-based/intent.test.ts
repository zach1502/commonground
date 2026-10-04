import { describe, expect, it } from 'vitest';

import {
  CANNED_SENTENCES,
  DOG_PARK_SENTENCE,
  intentProviderContract,
} from '../../ports/__contracts__/intent-provider.contract.js';

import { RuleBasedIntentProvider } from './intent.js';

intentProviderContract('RuleBasedIntentProvider', () => new RuleBasedIntentProvider());

const rules = new RuleBasedIntentProvider();
// The cases below check the reading itself, so they look at the answer's value only.
const provider = { parse: async (text: string) => (await rules.parse(text)).value };

describe('RuleBasedIntentProvider', () => {
  it('says the fixed rules read the description', async () => {
    expect(await rules.parse('a pond')).toMatchObject({ source: 'rule-based' });
  });

  it('matches the snapshot for each canned sentence', async () => {
    const intents = await Promise.all(CANNED_SENTENCES.map((text) => provider.parse(text)));
    expect(
      Object.fromEntries(CANNED_SENTENCES.map((text, index) => [text, intents[index]])),
    ).toMatchSnapshot();
  });

  it('reads the dog park sentence feature by feature', async () => {
    const intent = await provider.parse(DOG_PARK_SENTENCE);
    expect(intent.features).toEqual([
      {
        catalogId: 'off-leash-area',
        category: 'dog',
        count: 1,
        placement: { zone: 'south-east' },
      },
      { catalogId: 'pond', category: 'water', count: 1, placement: { terrain: 'low' } },
      { category: 'tree', count: 8 },
    ]);
  });

  it('reads numbers, sizes and a place to be near', async () => {
    const intent = await provider.parse('Two small benches near the playground');
    expect(intent.features).toEqual([
      { category: 'seating', count: 2, size: 'small', placement: { near: 'playground' } },
    ]);
  });

  it('reads digits and a place to stay away from', async () => {
    const intent = await provider.parse('12 trees away from the tennis court');
    expect(intent.features).toEqual([
      { category: 'tree', count: 12, placement: { awayFrom: 'tennis court' } },
    ]);
  });
});

describe('RuleBasedIntentProvider paths, canopy and character', () => {
  it('reads the path style and surface', async () => {
    expect((await provider.parse('a loop of gravel')).paths).toEqual({
      style: 'loop',
      surface: 'gravel',
    });
    expect((await provider.parse('paths that connect everything')).paths).toEqual({
      style: 'connect-all',
    });
    expect((await provider.parse('minimal paths on a boardwalk')).paths).toEqual({
      style: 'minimal',
      surface: 'boardwalk',
    });
  });

  it('reads how much canopy and what character the resident wants', async () => {
    const shady = await provider.parse('a shady forest with native plants');
    expect(shady).toMatchObject({ canopy: 'maximize', character: 'natural' });
    const some = await provider.parse('plant some trees by the lawn for picnics');
    expect(some).toMatchObject({ canopy: 'add-some', character: 'open-lawn' });
    const active = await provider.parse('basketball and a playground');
    expect(active).toMatchObject({ canopy: 'keep-existing', character: 'active' });
  });

  it('caps counts and the number of features at the schema limits', async () => {
    const many = await provider.parse('900 benches');
    expect(many.features[0]?.count).toBe(50);
    const long = await provider.parse(Array.from({ length: 30 }, () => 'a bench').join(', '));
    expect(long.features).toHaveLength(20);
  });
});
