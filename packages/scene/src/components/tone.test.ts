import { describe, expect, it } from 'vitest';

import { acesFilmic, inverseAcesFilmic } from './tone.js';

describe('acesFilmic', () => {
  it('compresses bright light to 1 or less', () => {
    expect(Math.max(...acesFilmic([4, 4, 4], 1))).toBeLessThanOrEqual(1);
    expect(Math.max(...acesFilmic([0, 0, 0], 1))).toBeLessThan(0.01);
  });
});

describe('inverseAcesFilmic', () => {
  it('finds the linear colour that tone maps back to the sky colour', () => {
    const sky: [number, number, number] = [0.6172, 0.7682, 0.8714];
    const untoned = inverseAcesFilmic(sky, 1);
    acesFilmic(untoned, 1).forEach((channel, index) => {
      expect(channel).toBeCloseTo(sky[index] ?? 0, 3);
    });
  });
});
