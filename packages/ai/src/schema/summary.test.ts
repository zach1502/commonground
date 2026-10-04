import { describe, expect, it } from 'vitest';

import { summaryIssues, summaryJsonSchema, summarySchema } from './summary.js';

const TOP = [{ id: 'design-1' }, { id: 'design-2' }];

describe('summarySchema', () => {
  it('accepts themes and tradeoffs', () => {
    const summary = summarySchema.parse({
      themes: [{ label: 'Room for play', designCount: 2, exampleDesignId: 'design-1' }],
      tradeoffs: [{ a: 'More trees', b: 'More play', leanA: 6, chose: 10 }],
    });
    expect(summary.themes[0]?.designCount).toBe(2);
    expect(summary.tradeoffs[0]?.chose).toBe(10);
  });

  it('rejects a split that names no designs', () => {
    const tradeoffs = [{ a: 'More trees', b: 'More play', leanA: 0, chose: 0 }];
    expect(summarySchema.safeParse({ themes: [], tradeoffs }).success).toBe(false);
  });

  it('exposes a named JSON schema for the model', () => {
    expect(summaryJsonSchema.name).toBe('park-summary');
    expect(summaryJsonSchema.schema).toHaveProperty('type', 'object');
  });
});

describe('summaryIssues', () => {
  it('finds nothing wrong with a consistent summary', () => {
    const summary = {
      themes: [{ label: 'Room for play', designCount: 2, exampleDesignId: 'design-2' }],
      tradeoffs: [],
    };
    expect(summaryIssues(summary, TOP)).toEqual([]);
  });

  it('flags a count above the number of top designs and an unknown example', () => {
    const summary = {
      themes: [{ label: 'Room for play', designCount: 3, exampleDesignId: 'design-9' }],
      tradeoffs: [],
    };
    expect(summaryIssues(summary, TOP)).toEqual([
      'Room for play counts 3 designs but only 2 were given',
      'Room for play names design-9, which is not a top design',
    ]);
  });
});
