import { describe, expect, it } from 'vitest';

import { randomContract } from '../ports/__contracts__/random.contract.js';

import { createSeededRandom } from './seeded-random.js';

const SEED = 42;
const OTHER_SEED = 7;
const SAMPLE_COUNT = 1000;
const REFERENCE_FIRST_VALUE = 0.6011037519201636;
const PRECISION_DIGITS = 15;

function sample(seed: number, count: number): number[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

randomContract('createSeededRandom', () => createSeededRandom(SEED));

describe('createSeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sample(SEED, SAMPLE_COUNT)).toEqual(sample(SEED, SAMPLE_COUNT));
    expect(sample(SEED, 1)).not.toEqual(sample(OTHER_SEED, 1));
  });

  it('stays within [0, 1)', () => {
    const values = sample(SEED, SAMPLE_COUNT);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });

  it('matches the mulberry32 reference output for seed 42', () => {
    expect(sample(SEED, 1)[0]).toBeCloseTo(REFERENCE_FIRST_VALUE, PRECISION_DIGITS);
  });
});
