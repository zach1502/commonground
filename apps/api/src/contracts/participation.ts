import { z } from '@hono/zod-openapi';

import {
  AGE_BANDS,
  FSA_PATTERN,
  QUEUE_BATCH_SIZE,
  VOTE_COMMENT_MAX_CHARS,
  VOTE_REASONS,
  voteCommentSchema,
  voteReasonSchema,
} from '@parkshape/core';

import { isoDateSchema, userSchema } from './common.js';
import { designSummarySchema, projectSchema } from './projects-designs.js';

const MAX_REASONS = VOTE_REASONS.length;
const MAX_QUEUE_SIZE = 20;

export const personaSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    role: z.enum(['resident', 'staff']),
    about: z.string(),
  })
  .openapi('Persona');

export const personaListSchema = z
  .object({
    personas: z.array(personaSchema),
    staffCodeRequired: z.boolean().openapi({
      description: 'True when staff personas need the access code to log in.',
    }),
  })
  .openapi('PersonaList');

const MAX_ACCESS_CODE_LENGTH = 200;

export const loginBodySchema = z
  .object({
    persona: z.string().min(1).openapi({ example: 'persona-bob-walksadog' }),
    accessCode: z.string().max(MAX_ACCESS_CODE_LENGTH).optional().openapi({
      description: 'The staff access code. Staff personas need it when staffCodeRequired is true.',
    }),
  })
  .openapi('LoginBody');

export const selfReportSchema = z
  .object({
    fsa: z.string().regex(FSA_PATTERN).nullable().openapi({ example: 'V5T' }),
    ageBand: z.enum(AGE_BANDS).nullable(),
  })
  .openapi('SelfReport', {
    description: 'The first 3 characters of a postal code and an age band. Both are optional.',
  });

export const meSchema = z
  .object({ user: userSchema, selfReport: z.union([selfReportSchema, z.null()]) })
  .openapi('Me');

const commentFieldSchema = voteCommentSchema.optional().openapi({
  description: `The voter's own words in plain text, trimmed, at most ${String(VOTE_COMMENT_MAX_CHARS)} characters and no HTML tags. Blank or left out, the vote has no comment.`,
  example: 'Keep the garden plots by the lane.',
});

const voteChoiceFields = {
  value: z.union([z.literal(1), z.literal(-1)]),
  reasons: z.array(voteReasonSchema).max(MAX_REASONS),
  comment: commentFieldSchema,
};

export const voteBodySchema = z
  .object({ designId: z.string().min(1), ...voteChoiceFields })
  .openapi('VoteBody');

export const voteChangeSchema = z.object(voteChoiceFields).openapi('VoteChange', {
  description: 'The whole vote: a change to the value, the reasons or the comment replaces all 3.',
});

const voteRecordSchema = z
  .object({
    id: z.string(),
    designId: z.string(),
    value: z.union([z.literal(1), z.literal(-1)]),
    reasons: z.array(voteReasonSchema),
    comment: z.string().nullable(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .openapi('VoteRecord');

const designCountsSchema = z.object({
  id: z.string(),
  up: z.number().int(),
  down: z.number().int(),
});

export const voteResultSchema = z
  .object({
    outcome: z.enum(['created', 'updated']),
    vote: voteRecordSchema,
    design: designCountsSchema,
  })
  .openapi('VoteResult');

export const withdrawResultSchema = z
  .object({ outcome: z.enum(['withdrawn', 'absent']), design: designCountsSchema })
  .openapi('WithdrawResult', {
    description: "'absent' when the caller had no vote on the design, so nothing changed.",
  });

export const myVoteSchema = z
  .object({ vote: z.union([voteRecordSchema, z.null()]) })
  .openapi('MyVote', {
    description: "The caller's vote on a design, or null when they have not voted.",
  });

export const queueQuerySchema = z.object({
  n: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_QUEUE_SIZE)
    .default(QUEUE_BATCH_SIZE)
    .openapi({ param: { name: 'n', in: 'query' }, example: QUEUE_BATCH_SIZE }),
});

export const queuePosterSchema = z
  .object({
    designId: z.string(),
    url: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    placeholder: z.string().openapi({ description: 'A solid colour to show until it loads.' }),
  })
  .openapi('QueuePoster', {
    description: 'The first design picture, so the page can start loading it at once.',
  });

export const queueSchema = z
  .object({
    project: projectSchema,
    designs: z.array(designSummarySchema),
    baselineDesignId: z.string().nullable(),
    poster: z.union([queuePosterSchema, z.null()]),
  })
  .openapi('Queue');

export const leaderboardSchema = z
  .object({
    prior: z.object({ up: z.number().int(), down: z.number().int() }),
    entries: z.array(
      z.object({ rank: z.number().int(), score: z.number(), design: designSummarySchema }),
    ),
  })
  .openapi('Leaderboard');
