import { describe, expect, it } from 'vitest';

import { midSentence, themeRows } from './summary-rows';

const theme = (label: string, designCount: number) => ({
  label,
  designCount,
  exampleDesignId: 'd1',
});

describe('midSentence', () => {
  it('lowers the first letter of a label placed inside a sentence', () => {
    expect(midSentence('More water')).toBe('more water');
  });

  it('keeps an acronym as it is', () => {
    expect(midSentence('BBQ area')).toBe('BBQ area');
  });
});

describe('themeRows', () => {
  it('joins every theme found in all the top designs into one row', () => {
    const rows = themeRows(
      [
        theme('Keep and add trees', 10),
        theme('Paths through the park', 10),
        theme('A community garden', 10),
        theme('Places to sit', 8),
      ],
      10,
    );
    expect(rows).toEqual([
      {
        key: 'Keep and add trees',
        label: 'Keep and add trees, paths through the park and a community garden',
        count: 10,
        every: 'every',
      },
      { key: 'Places to sit', label: 'Places to sit', count: 8, every: 'some' },
    ]);
  });

  it('keeps one row per theme when no count reaches the total', () => {
    const rows = themeRows([theme('Places to sit', 4), theme('Water on the site', 4)], 10);
    expect(rows.map((row) => row.label)).toEqual(['Places to sit', 'Water on the site']);
  });
});
