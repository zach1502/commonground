import { describe, expect, it } from 'vitest';

import { readAt } from './read-at.js';

describe('readAt', () => {
  it('reads inside the array and falls back outside it', () => {
    const values = Float64Array.from([4, 5]);
    expect(readAt(values, 1, 0)).toBe(5);
    expect(readAt(values, 2, -1)).toBe(-1);
    expect(readAt(values, -1, Infinity)).toBe(Infinity);
  });
});
