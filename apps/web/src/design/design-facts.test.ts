import { describe, expect, it } from 'vitest';

import { contentsSentence, costSentence, factLine } from './design-facts';

// 105 is the raised-bed fit of the existing garden outline; the city records 56 plots there.
const TOTALS = { canopyPercent: 18.3, gardenPlots: 105, costCad: 310000 };

describe('factLine', () => {
  it('reads canopy and cost, with no vote counts', () => {
    expect(factLine(TOTALS)).toBe('Tree canopy 18%, cost $310,000');
  });

  it('gives no plot count, as the design page and insights give none', () => {
    expect(factLine(TOTALS)).not.toMatch(/plot|105/);
  });

  it('gives the same cost as the design page', () => {
    expect(factLine(TOTALS)).toContain('$310,000');
    expect(costSentence(TOTALS)).toContain('$310,000');
  });

  it('gives nothing for a design with no metrics yet', () => {
    expect(factLine(null)).toBeNull();
  });
});

describe('contentsSentence', () => {
  it('joins the counts into one sentence with and before the last', () => {
    const rows = [
      { category: 'tree', count: 42 },
      { category: 'seating', count: 4 },
      { category: 'washroom', count: 1 },
      { category: 'garden', count: 1 },
      { category: 'ground', count: 1 },
    ] as const;
    expect(contentsSentence(rows)).toBe(
      '42 trees, 4 seats, 1 washroom, 1 garden and 1 planted area.',
    );
  });

  it('gives nothing for an empty design', () => {
    expect(contentsSentence([])).toBeNull();
  });
});

describe('costSentence', () => {
  it('states the total cost', () => {
    expect(costSentence(TOTALS)).toBe('The design costs $310,000.');
  });

  it('gives nothing with no metrics', () => {
    expect(costSentence(null)).toBeNull();
  });
});
