import { describe, expect, it } from 'vitest';

import { baselineStamp } from './baseline-stamp';

describe('baselineStamp', () => {
  it('reads the same for the same document whatever the key order', () => {
    expect(baselineStamp({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      baselineStamp({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
  });

  it('differs when the document differs', () => {
    expect(baselineStamp({ items: ['server'] })).not.toBe(baselineStamp({ items: ['local'] }));
  });
});
