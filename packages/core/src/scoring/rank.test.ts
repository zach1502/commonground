import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORE_PRIOR } from '../constants.js';

import { rankDesigns } from './rank.js';

const ids = (ranked: readonly { id: string }[]): string[] => ranked.map((design) => design.id);

describe('rankDesigns', () => {
  it('ranks 3 up and 0 down below 90 up and 10 down', () => {
    const ranked = rankDesigns(
      [
        { id: 'few-votes', up: 3, down: 0 },
        { id: 'many-votes', up: 90, down: 10 },
      ],
      DEFAULT_SCORE_PRIOR,
    );
    expect(ids(ranked)).toEqual(['many-votes', 'few-votes']);
  });

  it('breaks equal scores by total votes, most first', () => {
    const ranked = rankDesigns(
      [
        { id: 'a', up: 1, down: 1 },
        { id: 'b', up: 5, down: 5 },
      ],
      DEFAULT_SCORE_PRIOR,
    );
    expect(ids(ranked)).toEqual(['b', 'a']);
  });

  it('breaks equal scores and totals by id, ascending', () => {
    const designs = [
      { id: 'c', up: 2, down: 1 },
      { id: 'a', up: 2, down: 1 },
      { id: 'b', up: 2, down: 1 },
    ];
    expect(ids(rankDesigns(designs, DEFAULT_SCORE_PRIOR))).toEqual(['a', 'b', 'c']);
  });

  it('gives the same order for any input order', () => {
    const designs = [
      { id: 'd', up: 0, down: 0 },
      { id: 'b', up: 4, down: 4 },
      { id: 'a', up: 4, down: 4 },
      { id: 'c', up: 7, down: 1 },
    ];
    const expected = ids(rankDesigns(designs, DEFAULT_SCORE_PRIOR));
    expect(ids(rankDesigns([...designs].reverse(), DEFAULT_SCORE_PRIOR))).toEqual(expected);
    expect(expected).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('rankDesigns output', () => {
  it('attaches the score and total votes and keeps other fields', () => {
    const [top] = rankDesigns([{ id: 'a', up: 2, down: 0, title: 'Pond' }], DEFAULT_SCORE_PRIOR);
    expect(top).toEqual({ id: 'a', up: 2, down: 0, title: 'Pond', score: 4 / 6, totalVotes: 2 });
  });

  it('does not change the input array', () => {
    const designs = [
      { id: 'b', up: 0, down: 3 },
      { id: 'a', up: 3, down: 0 },
    ];
    rankDesigns(designs, DEFAULT_SCORE_PRIOR);
    expect(ids(designs)).toEqual(['b', 'a']);
  });

  it('returns an empty list for no designs', () => {
    expect(rankDesigns([], DEFAULT_SCORE_PRIOR)).toEqual([]);
  });
});
