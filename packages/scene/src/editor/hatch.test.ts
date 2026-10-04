import { describe, expect, it } from 'vitest';

import { HATCH, hatchCoverage } from './hatch.js';

describe('hatchCoverage', () => {
  it('is fully on at the middle of a stripe and fully off in the middle of a gap', () => {
    // Stripes run along x + y = constant; the centre line of the first is at half a period.
    expect(hatchCoverage(HATCH.periodPx / 2, 0, HATCH)).toBe(1);
    expect(hatchCoverage(0, 0, HATCH)).toBe(0);
  });

  it('runs at 45 degrees: moving along the stripe keeps the same coverage', () => {
    for (let step = 0; step < 20; step += 1) {
      expect(hatchCoverage(3 + step, 5 - step, HATCH)).toBeCloseTo(hatchCoverage(3, 5, HATCH), 6);
    }
  });

  it('repeats every period across the stripes', () => {
    for (let x = 0; x < 12; x += 1) {
      expect(hatchCoverage(x + HATCH.periodPx, 2, HATCH)).toBeCloseTo(
        hatchCoverage(x, 2, HATCH),
        6,
      );
    }
  });

  it('leaves gaps wider than the stripes, so the ground shows through', () => {
    const samples = Array.from({ length: 400 }, (_, x) => hatchCoverage(x / 4, 0, HATCH));
    const lit = samples.filter((value) => value > 0).length / samples.length;
    const clear = samples.filter((value) => value === 0).length / samples.length;
    expect(lit).toBeGreaterThan(0.3);
    expect(clear).toBeGreaterThan(0.4);
  });
});
