import { describe, expect, it } from 'vitest';

import { err, ok, type Result } from './result.js';

function half(value: number): Result<number, 'odd'> {
  return value % 2 === 0 ? ok(value / 2) : err('odd');
}

describe('Result', () => {
  it('carries a value on success', () => {
    expect(half(4)).toEqual({ ok: true, value: 2 });
  });

  it('carries an error on failure', () => {
    expect(half(3)).toEqual({ ok: false, error: 'odd' });
  });
});
