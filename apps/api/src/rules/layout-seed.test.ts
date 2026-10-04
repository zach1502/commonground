import { describe, expect, it } from 'vitest';

import { createSeedCounter } from './layout-seed.js';

describe('createSeedCounter', () => {
  it('counts up from the base seed', () => {
    const next = createSeedCounter(10);
    expect([next(), next(), next()]).toEqual([11, 12, 13]);
  });

  it('wraps within 32 bits', () => {
    const next = createSeedCounter(0xffff_ffff);
    expect(next()).toBe(0);
  });
});
