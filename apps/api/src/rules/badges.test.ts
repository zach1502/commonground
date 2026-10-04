import { describe, expect, it } from 'vitest';

import { CONSTRAINT_KEYS, type ConstraintKey } from '@parkshape/core';

import {
  hardFailuresFrom,
  softWarningsFrom,
  type ConstraintReadout,
  type ConstraintReadouts,
} from './badges.js';

const ok: ConstraintReadout = { status: 'ok', value: 0, limit: 0, message: 'Fine.' };

function readouts(
  overrides: Partial<Record<ConstraintKey, ConstraintReadout>>,
): ConstraintReadouts {
  return Object.fromEntries(
    CONSTRAINT_KEYS.map((key) => [key, overrides[key] ?? ok]),
  ) as ConstraintReadouts;
}

describe('hardFailuresFrom', () => {
  it('lists failing constraints in order with their messages', () => {
    const constraints = readouts({
      budget: { status: 'fail', value: 100, limit: 80, message: 'Over the budget.' },
      canopy: { status: 'fail', value: 10, limit: 30, message: 'Too little canopy.' },
    });
    expect(hardFailuresFrom(constraints)).toEqual([
      { key: 'budget', message: 'Over the budget.' },
      { key: 'canopy', message: 'Too little canopy.' },
    ]);
  });

  it('is empty when nothing fails', () => {
    expect(hardFailuresFrom(readouts({}))).toEqual([]);
  });
});

describe('softWarningsFrom', () => {
  it('badges a budget overrun as a rounded percent over', () => {
    const constraints = readouts({
      budget: { status: 'warn', value: 112, limit: 100, message: 'A little over.' },
    });
    expect(softWarningsFrom(constraints)).toEqual([
      { key: 'budget', message: 'A little over.', badge: 'Over budget 12%' },
    ]);
  });

  it('badges canopy and impervious gaps by direction', () => {
    const constraints = readouts({
      canopy: { status: 'warn', value: 24, limit: 30, message: 'Below target.' },
      impervious: { status: 'warn', value: 55, limit: 50, message: 'Above the limit.' },
    });
    const badges = softWarningsFrom(constraints).map((warning) => warning.badge);
    expect(badges).toEqual(['Canopy 20% short', 'Hard surface 10% over']);
  });

  it('badges count-based constraints with a singular or plural noun', () => {
    const one = readouts({
      requiredFeatures: { status: 'warn', value: 1, limit: 0, message: 'One short.' },
    });
    const many = readouts({
      slopes: { status: 'warn', value: 3, limit: 0, message: 'Three spots.' },
    });
    expect(softWarningsFrom(one)[0]?.badge).toBe('1 feature short');
    expect(softWarningsFrom(many)[0]?.badge).toBe('3 steep spots');
  });

  it('badges every count-based constraint key', () => {
    const constraints = readouts({
      forbiddenZones: { status: 'warn', value: 2, limit: 0, message: 'Two zones.' },
      counts: { status: 'warn', value: 1, limit: 0, message: 'One count.' },
      terraform: { status: 'warn', value: 4, limit: 0, message: 'Four grades.' },
      treeProtection: { status: 'warn', value: 1, limit: 0, message: 'One root.' },
    });
    expect(softWarningsFrom(constraints).map((warning) => warning.badge)).toEqual([
      '2 closed-zone hits',
      '1 count issue',
      '4 grading issues',
      '1 root-zone hit',
    ]);
  });
});
