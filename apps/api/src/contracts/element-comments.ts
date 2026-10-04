import { z } from '@hono/zod-openapi';

import {
  COMMENT_KINDS,
  ELEMENT_COMMENT_MAX_CHARS,
  PLANNER_REPLY_MAX_CHARS,
  categorySchema,
  commentKindSchema,
  commentStatusSchema,
  elementKindSchema,
  localPointSchema,
  plainTextSchema,
} from '@parkshape/core';

import { isStorableText } from '../storable-text.js';

import { isoDateSchema } from './common.js';

const UNSTORABLE = 'Text may not hold a null character or a lone surrogate.';

function typedText(maxChars: number) {
  return plainTextSchema(maxChars).refine(isStorableText, UNSTORABLE);
}

const pointSchema = z.object({ x: z.number(), y: z.number() }).openapi('SurfacePoint', {
  description: 'Where on a path or area the person tapped, in local metres.',
});

const kindCounts = Object.fromEntries(
  COMMENT_KINDS.map((kind) => [kind, z.number().int()]),
) as Record<(typeof COMMENT_KINDS)[number], z.ZodNumber>;

export const commentKindCountsSchema = z.object(kindCounts).openapi('CommentKindCounts');

export const newCommentSchema = z
  .object({
    elementId: z.string().min(1).refine(isStorableText, UNSTORABLE),
    kind: commentKindSchema,
    text: typedText(ELEMENT_COMMENT_MAX_CHARS)
      .optional()
      .openapi({
        description: `Plain text, trimmed, at most ${String(ELEMENT_COMMENT_MAX_CHARS)} characters and no HTML tags. Left out, the kind alone is the comment.`,
        example: 'Face the bench toward the playground.',
      }),
    surfacePoint: localPointSchema.optional().openapi({
      description: 'Where on a path or area the person tapped, in local metres. Dropped on items.',
    }),
  })
  .openapi('NewComment', {
    description:
      'The element and the kind of comment. The server reads the element kind and category from the design.',
  });

export const commentEditSchema = z
  .object({ text: typedText(ELEMENT_COMMENT_MAX_CHARS) })
  .openapi('CommentEdit');

export const commentResolveSchema = z
  .object({
    reply: typedText(PLANNER_REPLY_MAX_CHARS)
      .min(1)
      .optional()
      .openapi({ description: 'The planner reply. Left out, any earlier reply stays.' }),
  })
  .openapi('CommentResolve');

export const commentVisibilitySchema = z
  .object({ hidden: z.boolean() })
  .openapi('CommentVisibility');

export const commentRecordSchema = z
  .object({
    id: z.string(),
    designId: z.string(),
    elementId: z.string(),
    elementKind: elementKindSchema,
    category: categorySchema,
    kind: commentKindSchema,
    text: z.string(),
    status: commentStatusSchema,
    hidden: z.boolean().openapi({ description: 'Always false for residents.' }),
    createdAt: isoDateSchema,
    surfacePoint: z.union([pointSchema, z.null()]),
    plannerReply: z.union([z.object({ text: z.string(), repliedAt: isoDateSchema }), z.null()]),
    author: z.object({ displayName: z.string() }),
    mine: z.boolean().openapi({ description: 'True when the caller wrote the comment.' }),
    editable: z.boolean().openapi({
      description: 'True while the caller may still edit it: their own, open phase, 15 minutes.',
    }),
  })
  .openapi('ElementCommentRecord');

export const commentResultSchema = z
  .object({ outcome: z.enum(['created', 'updated']), comment: commentRecordSchema })
  .openapi('CommentResult', {
    description:
      "'updated' when the caller already had an open comment of this kind on the element.",
  });

export const commentRecordResultSchema = z
  .object({ comment: commentRecordSchema })
  .openapi('CommentRecordResult');

export const elementGroupSchema = z
  .object({
    elementId: z.string(),
    elementKind: elementKindSchema,
    category: categorySchema,
    label: z.string().openapi({ example: 'Bench, south-west' }),
    counts: commentKindCountsSchema,
    openCount: z.number().int(),
    comments: z.array(commentRecordSchema),
  })
  .openapi('ElementCommentGroup', {
    description: 'One element and its comments, oldest first. Counts leave out hidden comments.',
  });

export const designCommentsSchema = z
  .object({
    designId: z.string(),
    commenting: z.enum(['open', 'closed']),
    elements: z.array(elementGroupSchema),
  })
  .openapi('DesignComments');

const elementKindCounts = z.object({
  item: z.number().int(),
  path: z.number().int(),
  area: z.number().int(),
});

export const elementFeedbackSchema = z
  .object({
    total: z.number().int(),
    designs: z.array(
      z.object({
        designId: z.string(),
        title: z.string(),
        total: z.number().int(),
        byElementKind: elementKindCounts,
        byKind: commentKindCountsSchema,
      }),
    ),
  })
  .openapi('ElementFeedback', {
    description: 'Comments that are not hidden, per design, most commented first.',
  });

export type CommentRecord = z.infer<typeof commentRecordSchema>;
export type DesignComments = z.infer<typeof designCommentsSchema>;
export type ElementFeedback = z.infer<typeof elementFeedbackSchema>;
