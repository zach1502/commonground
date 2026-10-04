import { describe, expect, it } from 'vitest';

import type { Random } from '../random.js';

const DRAWS = 200;

/** Behaviour every Random adapter must have. Each adapter test calls this with a factory. */
export function randomContract(name: string, makeRandom: () => Random): void {
  describe(`${name} meets the Random contract`, () => {
    it('returns numbers in [0, 1)', () => {
      const random = makeRandom();
      const values = Array.from({ length: DRAWS }, () => random.next());
      expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    });

    it('does not return one value forever', () => {
      const random = makeRandom();
      const values = new Set(Array.from({ length: DRAWS }, () => random.next()));
      expect(values.size).toBeGreaterThan(1);
    });
  });
}
