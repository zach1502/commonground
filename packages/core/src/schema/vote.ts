import { z } from 'zod';

import { VOTE_COMMENT_MAX_CHARS } from '../constants.js';

/**
 * The fixed set of reasons a voter can attach to a vote. These are stable tokens; the words a
 * voter reads live in the web locales, so copy changes never touch stored data.
 */
export const VOTE_REASONS = [
  'play',
  'trees',
  'paths',
  'dog-area',
  'garden',
  'water',
  'too-expensive',
  'too-paved',
  'accessibility',
  'other',
] as const;

export const voteReasonSchema = z.enum(VOTE_REASONS);

export type VoteReason = (typeof VOTE_REASONS)[number];

/** A vote is up (1) or down (-1). */
export const voteValueSchema = z.union([z.literal(1), z.literal(-1)]);

export type VoteValue = z.output<typeof voteValueSchema>;

// An opening, closing or comment tag. A lone < or > in plain text, such as "cost < $5,000", is fine.
const HTML_TAG = /<\/?[a-z!][^>]*>/i;

/**
 * A voter's free-text comment: plain text, trimmed, at most VOTE_COMMENT_MAX_CHARS characters.
 * A blank comment is stored as no comment.
 */
export const voteCommentSchema = z
  .string()
  .trim()
  .max(VOTE_COMMENT_MAX_CHARS)
  .refine((text) => !HTML_TAG.test(text), 'Write the comment as plain text, with no HTML tags.')
  .nullable()
  .transform((text) => (text === null || text === '' ? null : text));
