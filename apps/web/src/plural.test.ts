import { describe, expect, it } from 'vitest';

import { pluralise } from './plural';

const TREES = { one: '{count} tree', other: '{count} trees' };

describe('pluralise', () => {
  it('picks the one form for 1 and the other form for 0 and many', () => {
    expect(pluralise(1, TREES)).toBe('1 tree');
    expect(pluralise(0, TREES)).toBe('0 trees');
    expect(pluralise(37, TREES)).toBe('37 trees');
  });

  it('fills the other slots too', () => {
    const forms = { one: '{count} {kind} bench', other: '{count} {kind} benches' };
    expect(pluralise(2, forms, { kind: 'picnic' })).toBe('2 picnic benches');
  });
});
