import { z } from '@hono/zod-openapi';

import {
  AGE_BANDS,
  HEATMAP_LAYERS,
  INSIGHTS_EXPORT_TOP_N,
  SITE_SECTIONS,
  categorySchema,
  constraintKeySchema,
  voteReasonSchema,
} from '@parkshape/core';

import { isoDateSchema } from './common.js';

const MAX_EXPORT_DESIGNS = 50;

const countSchema = z.number().int().nonnegative();

const reasonCountSchema = z.object({ reason: voteReasonSchema, count: countSchema });

const suppressedCountFields = {
  count: countSchema.nullable(),
  suppressed: z
    .boolean()
    .openapi({ description: 'True when fewer than 5 people are in the group.' }),
};

const voteCommentsSchema = z
  .object({
    total: countSchema,
    byDesign: z.array(
      z.object({
        designId: z.string(),
        title: z.string(),
        comments: z.array(
          z.object({
            voteId: z.string(),
            displayName: z.string(),
            text: z.string(),
            updatedAt: isoDateSchema,
          }),
        ),
      }),
    ),
  })
  .openapi('VoteComments', {
    description: 'What voters wrote with their votes, newest first, under each live design.',
  });

const heatmapSchema = z
  .object({
    category: z.enum(HEATMAP_LAYERS),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cellM: z.number().positive(),
    originLocal: z.object({ x: z.number(), y: z.number() }),
    values: z.array(z.number().min(0).max(1)).openapi({
      description: 'Share of designs covering each cell, row by row from the south-west corner.',
    }),
  })
  .openapi('Heatmap');

export const insightsSchema = z
  .object({
    headline: z.object({
      designsSubmitted: countSchema,
      uniqueVoters: countSchema,
      votesCast: countSchema,
    }),
    features: z.array(
      z.object({
        category: categorySchema,
        designsWithPercent: z.number(),
        averageCount: z.number(),
      }),
    ),
    heatmaps: z.array(heatmapSchema),
    baselineDiff: z.array(
      z.object({
        featureId: z.string(),
        kind: z.enum(['item', 'path', 'area']),
        label: z.string(),
        where: z.enum(SITE_SECTIONS),
        movedPercent: z.number(),
        removedPercent: z.number(),
        resizedPercent: z.number(),
      }),
    ),
    compliance: z.array(
      z.object({ key: constraintKeySchema, ok: countSchema, warn: countSchema, fail: countSchema }),
    ),
    earthworks: z.object({
      binM3: z.number().positive(),
      bins: z.array(z.object({ fromM3: z.number(), toM3: z.number(), count: countSchema })),
    }),
    reasons: z.object({
      overall: z.array(reasonCountSchema),
      up: z.array(reasonCountSchema),
      down: z.array(reasonCountSchema),
      byDesign: z.array(
        z.object({
          designId: z.string(),
          title: z.string(),
          votes: countSchema,
          counts: z.array(reasonCountSchema),
        }),
      ),
    }),
    comments: voteCommentsSchema,
    engagement: z.object({
      byFsa: z.array(z.object({ group: z.string().nullable(), ...suppressedCountFields })),
      byAgeBand: z.array(
        z.object({ group: z.enum(AGE_BANDS).nullable(), ...suppressedCountFields }),
      ),
    }),
  })
  .openapi('Insights', {
    description: 'What residents built and said, for planners. Groups under 5 people are hidden.',
  });

export type InsightsBody = z.infer<typeof insightsSchema>;

export const exportQuerySchema = z.object({
  n: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_EXPORT_DESIGNS)
    .default(INSIGHTS_EXPORT_TOP_N)
    .openapi({ param: { name: 'n', in: 'query' }, example: INSIGHTS_EXPORT_TOP_N }),
});
