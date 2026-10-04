import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORE_PRIOR } from '../constants.js';

import { score } from './score.js';

describe('score', () => {
  it('adds the prior to the vote counts', () => {
    expect(score(3, 1, { up: 2, down: 2 })).toBeCloseTo(5 / 8);
  });

  it('gives the prior mean when there are no votes', () => {
    expect(score(0, 0, DEFAULT_SCORE_PRIOR)).toBe(0.5);
  });

  it('uses the default prior when none is given', () => {
    expect(score(3, 0)).toBe(score(3, 0, DEFAULT_SCORE_PRIOR));
  });

  it('scores 3 up and 0 down below 90 up and 10 down', () => {
    expect(score(3, 0, DEFAULT_SCORE_PRIOR)).toBeLessThan(score(90, 10, DEFAULT_SCORE_PRIOR));
  });

  it('rejects negative or fractional vote counts', () => {
    expect(() => score(-1, 0)).toThrow(RangeError);
    expect(() => score(0, 1.5)).toThrow(RangeError);
  });

  it('rejects a prior with no weight', () => {
    expect(() => score(0, 0, { up: 0, down: 0 })).toThrow(RangeError);
    expect(() => score(1, 1, { up: -1, down: 2 })).toThrow(RangeError);
  });

  it('accepts a prior with 0 up or 0 down when the total is above 0', () => {
    expect(score(1, 1, { up: 0, down: 2 })).toBe(1 / 4);
    expect(score(1, 1, { up: 2, down: 0 })).toBe(3 / 4);
  });

  it('rejects a prior with negative down even when the total is above 0', () => {
    expect(() => score(1, 1, { up: 2, down: -1 })).toThrow(RangeError);
  });
});
