import { describe, expect, it } from 'vitest';

import { metreUvs } from './uv.js';

describe('metreUvs', () => {
  it('takes u from x and v from z', () => {
    expect([...metreUvs(new Float32Array([1, 9, 2, 3.5, 9, 4]))]).toEqual([1, 2, 3.5, 4]);
  });
});
