import { describe, expect, it } from 'vitest';

import { percentile } from './frame-times.js';

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(values, 0.95)).toBe(95);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 1)).toBe(100);
  });

  it('does not depend on input order', () => {
    expect(percentile([30, 10, 20], 0.5)).toBe(20);
  });

  it('is zero for no samples', () => {
    expect(percentile([], 0.95)).toBe(0);
  });
});
