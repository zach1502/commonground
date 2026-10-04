import { describe, expect, it } from 'vitest';

import { plainTextSchema } from './plain-text.js';

const MAX = 10;
const text = plainTextSchema(MAX);

describe('plainTextSchema', () => {
  it('trims and keeps text at the limit', () => {
    expect(text.parse('  0123456789  ')).toBe('0123456789');
  });

  it('refuses text one character over the limit', () => {
    expect(text.safeParse('01234567890').success).toBe(false);
  });

  it('allows an empty string', () => {
    expect(text.parse('   ')).toBe('');
  });

  it('refuses HTML tags', () => {
    expect(text.safeParse('<b>hi</b>').success).toBe(false);
    expect(text.safeParse('<!-- x -->').success).toBe(false);
  });

  it('allows a lone angle bracket', () => {
    expect(text.parse('cost < $5')).toBe('cost < $5');
  });
});
