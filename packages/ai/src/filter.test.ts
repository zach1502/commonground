import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import copied from './content/content-rules.json' with { type: 'json' };
import { cleanText, contentProblems, filterIntent, filterSummary } from './filter.js';
import type { Intent } from './schema/intent.js';

const SOURCE = new URL('../../../tools/preflight/content-rules.json', import.meta.url);

describe('content rules copy', () => {
  it('matches tools/preflight/content-rules.json; copy the file over when this fails', () => {
    expect(copied).toEqual(JSON.parse(readFileSync(SOURCE, 'utf8')));
  });
});

describe('cleanText', () => {
  it('leaves plain text alone', () => {
    expect(cleanText('More trees along the paths')).toBe('More trees along the paths');
  });

  it('swaps a banned word for its plain word and keeps the capital', () => {
    expect(cleanText('Enhance the play area')).toBe('Improve the play area');
    expect(cleanText('Paths that leverage the slope')).toBe('Paths that use the slope');
  });

  it('removes filler words and tidies the spaces left behind', () => {
    expect(cleanText('A vibrant meadow')).toBe('A meadow');
  });

  it('drops text whose banned phrase has no plain swap', () => {
    expect(cleanText('A tapestry of gardens')).toBeUndefined();
  });

  it('fixes dashes, curly quotes and emoji', () => {
    expect(cleanText('Trees \u2014 lots of them')).toBe('Trees, lots of them');
    expect(cleanText('\u201CShade\u201D for the benches')).toBe('"Shade" for the benches');
    expect(cleanText('Dog area \u{1F415}')).toBe('Dog area');
  });

  it('drops text that breaks a prose pattern it cannot fix', () => {
    expect(cleanText('not just trees, but water too')).toBeUndefined();
  });

  it('drops text that is empty once cleaned', () => {
    expect(cleanText('overall')).toBeUndefined();
  });

  it('reports no problems once text is clean', () => {
    expect(contentProblems('Improve the play area')).toEqual([]);
    expect(contentProblems('A robust plan')).toEqual(['banned word "robust"']);
  });
});

describe('filterSummary', () => {
  it('rewrites labels and drops items that cannot be cleaned', () => {
    const summary = filterSummary({
      themes: [
        { label: 'Robust play areas', designCount: 2, exampleDesignId: 'design-1' },
        { label: 'A tapestry of trees', designCount: 1, exampleDesignId: 'design-2' },
      ],
      tradeoffs: [
        { a: 'More trees', b: 'A seamless lawn', leanA: 5, chose: 10 },
        { a: 'A testament to paths', b: 'More play', leanA: 4, chose: 10 },
      ],
    });
    expect(summary).toEqual({
      themes: [{ label: 'Strong play areas', designCount: 2, exampleDesignId: 'design-1' }],
      tradeoffs: [{ a: 'More trees', b: 'A smooth lawn', leanA: 5, chose: 10 }],
    });
  });

  it('cleans the comment line and drops one that cannot be cleaned', () => {
    const empty = { themes: [], tradeoffs: [] };
    expect(filterSummary({ ...empty, commentLine: '6 comments, most on a vibrant bench' })).toEqual(
      {
        ...empty,
        commentLine: '6 comments, most on a bench',
      },
    );
    expect(filterSummary({ ...empty, commentLine: 'A tapestry of comments' })).toEqual(empty);
  });
});

describe('filterIntent', () => {
  const intent: Intent = {
    features: [
      { category: 'seating', count: 3, placement: { near: 'the vibrant playground' } },
      { category: 'play', count: 1, placement: { awayFrom: 'the tapestry', zone: 'north' } },
    ],
    paths: { style: 'loop' },
    canopy: 'keep-existing',
    character: 'active',
  };

  it('cleans place names and removes ones it cannot clean', () => {
    const filtered = filterIntent(intent);
    expect(filtered.features[0]?.placement).toEqual({ near: 'the playground' });
    expect(filtered.features[1]?.placement).toEqual({ zone: 'north' });
  });
});
