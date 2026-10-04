import { describe, expect, it } from 'vitest';

import { VOTE_REASONS } from '@parkshape/core';

import { REASON_IDS } from './vote-reasons';

describe('REASON_IDS', () => {
  it('lists the same reasons, in the same order, as the core vote schema', () => {
    expect(REASON_IDS).toEqual(VOTE_REASONS);
  });
});
