import { describe, expect, it } from 'vitest';

import { itemAt, valueAt } from './arrays.js';

describe('valueAt', () => {
  it('reads a number inside the array', () => {
    expect(valueAt(new Float32Array([4, 5]), 1)).toBe(5);
  });

  it('refuses an index outside the array', () => {
    expect(() => valueAt([1], 3)).toThrow(RangeError);
  });
});

describe('itemAt', () => {
  it('wraps around a closed ring', () => {
    expect(itemAt(['a', 'b', 'c'], 3)).toBe('a');
    expect(itemAt(['a', 'b', 'c'], -1)).toBe('c');
  });

  it('refuses an empty list', () => {
    expect(() => itemAt([], 0)).toThrow(RangeError);
  });
});
