import { describe, expect, it } from 'vitest';

import { FULL_TURN, QUARTER_TURN, symmetric } from './vector-layout.js';

describe('vector layout', () => {
  it('names the turns', () => {
    expect(QUARTER_TURN).toBeCloseTo(Math.PI / 2);
    expect(FULL_TURN).toBeCloseTo(2 * Math.PI);
  });

  it('spreads a unit random number around zero', () => {
    expect(symmetric(0)).toBe(-1);
    expect(symmetric(0.5)).toBe(0);
  });
});
