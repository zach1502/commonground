import { describe, expect, it } from 'vitest';

import { isTruthyFlag } from './ci.js';

describe('isTruthyFlag', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
  ])('%s is %s', (value, expected) => {
    expect(isTruthyFlag(value)).toBe(expected);
  });
});
