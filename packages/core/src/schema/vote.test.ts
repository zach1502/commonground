import { describe, expect, it } from 'vitest';

import { VOTE_COMMENT_MAX_CHARS } from '../constants.js';

import { VOTE_REASONS, voteCommentSchema, voteReasonSchema, voteValueSchema } from './vote.js';

describe('vote reasons', () => {
  it('lists ten stable tokens with no duplicates', () => {
    expect(VOTE_REASONS).toHaveLength(10);
    expect(new Set(VOTE_REASONS).size).toBe(VOTE_REASONS.length);
  });

  it('accepts every listed reason', () => {
    for (const reason of VOTE_REASONS) {
      expect(voteReasonSchema.parse(reason)).toBe(reason);
    }
  });

  it('rejects a reason outside the set', () => {
    expect(voteReasonSchema.safeParse('bike-lane').success).toBe(false);
  });

  it('accepts only 1 and -1 for a vote value', () => {
    expect(voteValueSchema.parse(1)).toBe(1);
    expect(voteValueSchema.parse(-1)).toBe(-1);
    expect(voteValueSchema.safeParse(0).success).toBe(false);
  });
});

describe('vote comments', () => {
  it('caps a comment at 500 characters', () => {
    expect(VOTE_COMMENT_MAX_CHARS).toBe(500);
    expect(voteCommentSchema.parse('a'.repeat(VOTE_COMMENT_MAX_CHARS))).toHaveLength(500);
    expect(voteCommentSchema.safeParse('a'.repeat(VOTE_COMMENT_MAX_CHARS + 1)).success).toBe(false);
  });

  it('trims the comment and stores a blank one as no comment', () => {
    expect(voteCommentSchema.parse('  More shade by the garden.  ')).toBe(
      'More shade by the garden.',
    );
    expect(voteCommentSchema.parse('   ')).toBeNull();
    expect(voteCommentSchema.parse(null)).toBeNull();
  });

  it('counts the length after trimming', () => {
    const padded = ` ${'a'.repeat(VOTE_COMMENT_MAX_CHARS)} `;
    expect(voteCommentSchema.parse(padded)).toHaveLength(VOTE_COMMENT_MAX_CHARS);
  });

  it('refuses HTML tags and keeps plain text with angle brackets', () => {
    expect(voteCommentSchema.safeParse('<b>shade</b>').success).toBe(false);
    expect(voteCommentSchema.safeParse('Nice <img src=x onerror=alert(1)>').success).toBe(false);
    expect(voteCommentSchema.safeParse('<!-- note -->').success).toBe(false);
    expect(voteCommentSchema.parse('Cost < $5,000 and grade > 2%')).toBe(
      'Cost < $5,000 and grade > 2%',
    );
  });
});
