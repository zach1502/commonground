import { describe, expect, it } from 'vitest';

import type { Logger } from '../logger.js';

/** Behaviour every Logger adapter must have. Each adapter test calls this with a factory. */
export function loggerContract(name: string, makeLogger: () => Logger): void {
  describe(`${name} meets the Logger contract`, () => {
    it('accepts a warning without throwing', () => {
      expect(() => {
        makeLogger().warn('AI fell back to the rule-based provider');
      }).not.toThrow();
    });
  });
}
