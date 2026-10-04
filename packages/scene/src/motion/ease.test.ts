import { describe, expect, it } from 'vitest';

import { eased } from './ease.js';

describe('eased', () => {
  it('starts at 0 and ends at 1 on every curve', () => {
    (['entry', 'exit', 'move'] as const).forEach((curve) => {
      expect(eased(curve, 0)).toBe(0);
      expect(eased(curve, 1)).toBe(1);
    });
  });

  it('clamps progress outside 0 to 1', () => {
    expect(eased('move', -0.5)).toBe(0);
    expect(eased('move', 2)).toBe(1);
  });

  // Reference values from a separate 60-step bisection of each CSS cubic-bezier.
  it('matches the CSS curves at reference points', () => {
    expect(eased('move', 0.05)).toBeCloseTo(0.0285, 3);
    expect(eased('move', 0.5)).toBeCloseTo(0.8778, 3);
    expect(eased('exit', 0.25)).toBeCloseTo(0.1285, 3);
    expect(eased('exit', 0.75)).toBeCloseTo(0.6676, 3);
    expect(eased('entry', 0.1)).toBeCloseTo(0.6214, 3);
  });

  it('starts slow on the move curve, rises fast on entry and starts slow on exit', () => {
    expect(eased('move', 0.05)).toBeLessThan(0.05);
    expect(eased('entry', 0.25)).toBeGreaterThan(0.5);
    expect(eased('exit', 0.25)).toBeLessThan(0.25);
  });

  it('never goes back or overshoots', () => {
    (['entry', 'exit', 'move'] as const).forEach((curve) => {
      let last = 0;
      for (let step = 0; step <= 100; step += 1) {
        const value = eased(curve, step / 100);
        expect(value).toBeGreaterThanOrEqual(last);
        expect(value).toBeLessThanOrEqual(1);
        last = value;
      }
    });
  });
});
