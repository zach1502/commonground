import { describe, expect, it } from 'vitest';

import {
  composeBlurb,
  composeTitle,
  fillDetail,
  LEAD_TAGS,
  loadFragmentBank,
  type DesignFacts,
} from './fragments.js';

const FACTS: DesignFacts = {
  lockedTrees: 12,
  newTrees: 9,
  plots: 24,
  costCad: 412_345,
  pathM: 180.4,
};
const MIN_FRAGMENTS = 35;
const MAX_FRAGMENTS = 45;

function fragmentCount(): number {
  const bank = loadFragmentBank();
  const lists = [
    ...Object.values(bank.titleLeads),
    ...Object.values(bank.titleTails),
    ...Object.values(bank.openers),
    bank.details,
  ];
  return lists.reduce((total, list) => total + list.length, 0);
}

describe('fragment bank', () => {
  it('holds about 40 hand-written fragments with a lead and an opener for every idea', () => {
    const bank = loadFragmentBank();
    expect(fragmentCount()).toBeGreaterThanOrEqual(MIN_FRAGMENTS);
    expect(fragmentCount()).toBeLessThanOrEqual(MAX_FRAGMENTS);
    for (const tag of LEAD_TAGS) {
      expect(bank.titleLeads[tag].length).toBeGreaterThan(0);
      expect(bank.openers[tag].length).toBeGreaterThan(0);
    }
  });

  it('builds a title from the lead idea and the path style', () => {
    const bank = loadFragmentBank();
    expect(composeTitle(bank, { lead: 'dog', pathStyle: 'loop', variant: 0 })).toBe(
      'Dog run on a loop',
    );
    expect(composeTitle(bank, { lead: 'garden', pathStyle: 'minimal', variant: 1 })).toBe(
      'Garden beds with few paths',
    );
  });

  it('writes an opener and one detail with a number from the design', () => {
    const bank = loadFragmentBank();
    expect(composeBlurb(bank, { lead: 'trees', variant: 0, facts: FACTS })).toBe(
      'I planted for shade first. I kept all 12 large trees where they stand.',
    );
    expect(composeBlurb(bank, { lead: 'play', variant: 3, facts: FACTS })).toBe(
      'I made room for kids to play on flat ground. My plan costs $412,000.',
    );
  });

  it('skips a detail whose number would read as 0', () => {
    const bank = loadFragmentBank();
    const facts = { ...FACTS, lockedTrees: 0 };
    expect(composeBlurb(bank, { lead: 'trees', variant: 0, facts })).toBe(
      'I planted for shade first. My plan adds 9 new trees.',
    );
    expect(fillDetail('The paths add up to {pathM} m.', { ...FACTS, pathM: 0.2 })).toBeUndefined();
    expect(fillDetail('Unknown {slot}.', FACTS)).toBeUndefined();
  });

  it('keeps the opener alone when no detail has a number to quote', () => {
    const bank = loadFragmentBank();
    const facts = { lockedTrees: 0, newTrees: 0, plots: 0, costCad: 0, pathM: 0 };
    expect(composeBlurb(bank, { lead: 'open', variant: 1, facts })).toBe(
      'I left a big lawn open for everyone.',
    );
  });
});
