import { describe, expect, it } from 'vitest';

import { runsInCi } from './ci.js';

describe('runsInCi', () => {
  it('is true when a CI service sets CI', () => {
    expect(runsInCi({ CI: 'true' })).toBe(true);
    expect(runsInCi({ CI: '1' })).toBe(true);
  });

  it('is false when CI is unset, empty or a false value', () => {
    expect(runsInCi({})).toBe(false);
    for (const value of ['', '0', 'false', 'FALSE', 'no', 'off']) {
      expect(runsInCi({ CI: value })).toBe(false);
    }
  });
});
