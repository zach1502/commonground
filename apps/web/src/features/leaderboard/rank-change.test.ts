import { describe, expect, it } from 'vitest';

import { anyRankChanged, rankChangeFor, ranksById, scorePercent } from './rank-change';

describe('ranksById', () => {
  it('numbers ids from one in order', () => {
    expect(ranksById(['a', 'b', 'c'])).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );
  });
});

describe('rankChangeFor', () => {
  const previous = ranksById(['a', 'b', 'c', 'd']);

  it('reports an upward move when the rank number falls', () => {
    expect(rankChangeFor('d', 2, previous)).toEqual({ direction: 'up', places: 2 });
  });

  it('reports a downward move when the rank number rises', () => {
    expect(rankChangeFor('a', 3, previous)).toEqual({ direction: 'down', places: 2 });
  });

  it('reports no change when the rank holds', () => {
    expect(rankChangeFor('b', 2, previous)).toEqual({ direction: 'same', places: 0 });
  });

  it('treats a design missing from the snapshot as unchanged', () => {
    expect(rankChangeFor('new', 1, previous)).toEqual({ direction: 'same', places: 0 });
  });
});

describe('anyRankChanged', () => {
  const previous = ranksById(['a', 'b']);

  it('is "none" while every design holds its rank, so the Change column can hide', () => {
    expect(
      anyRankChanged(
        [
          { id: 'a', rank: 1 },
          { id: 'b', rank: 2 },
        ],
        previous,
      ),
    ).toBe('none');
  });

  it('is "some" once a design moves', () => {
    expect(
      anyRankChanged(
        [
          { id: 'b', rank: 1 },
          { id: 'a', rank: 2 },
        ],
        previous,
      ),
    ).toBe('some');
  });
});

describe('scorePercent', () => {
  it('writes the share of up votes as a bare whole number', () => {
    expect(scorePercent(0.6)).toBe('60');
    expect(scorePercent(0.505)).toBe('51');
  });
});
