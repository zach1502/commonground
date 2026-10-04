import { describe, expect, it } from 'vitest';

import type { Clock } from '../clock.js';

/** Behaviour every Clock adapter must have. Each adapter test calls this with a factory. */
export function clockContract(name: string, makeClock: () => Clock): void {
  describe(`${name} meets the Clock contract`, () => {
    it('returns a valid Date', () => {
      expect(Number.isNaN(makeClock().now().getTime())).toBe(false);
    });

    it('never goes backwards between calls', () => {
      const clock = makeClock();
      const first = clock.now().getTime();
      expect(clock.now().getTime()).toBeGreaterThanOrEqual(first);
    });

    it('returns a new Date each call so callers cannot change its state', () => {
      const clock = makeClock();
      const first = clock.now();
      expect(clock.now()).not.toBe(first);
    });
  });
}
