import { z } from 'zod';

import {
  COMMENT_EDIT_WINDOW_MS,
  ELEMENT_COMMENT_MAX_CHARS,
  PLANNER_REPLY_MAX_CHARS,
} from '../constants.js';
import { elementKindSchema } from '../metrics/footprints.js';
import { categorySchema } from '../schema/catalog.js';
import { localPointSchema } from '../schema/geometry.js';
import { commentIdSchema, designIdSchema, itemIdSchema, userIdSchema } from '../schema/ids.js';
import { plainTextSchema } from '../schema/plain-text.js';
import type { ProjectPhase } from '../schema/project.js';

/** What a resident says about an element, in the order the composer offers them. */
export const COMMENT_KINDS = ['keep', 'move', 'change', 'remove', 'question'] as const;

export const commentKindSchema = z.enum(COMMENT_KINDS);
export const commentStatusSchema = z.enum(['open', 'resolved']);

export type CommentKind = z.infer<typeof commentKindSchema>;
export type CommentStatus = z.infer<typeof commentStatusSchema>;

/** Locale keys for the kind chips. The words live in the web locales, never in stored data. */
export const COMMENT_KIND_LABEL_KEYS = {
  keep: 'review.kind.keep',
  move: 'review.kind.move',
  change: 'review.kind.change',
  remove: 'review.kind.remove',
  question: 'review.kind.question',
} as const satisfies Readonly<Record<CommentKind, string>>;

export const plannerReplySchema = z.strictObject({
  text: plainTextSchema(PLANNER_REPLY_MAX_CHARS).min(1),
  repliedAt: z.iso.datetime(),
});

/**
 * One resident comment on one element of a submitted design. The server takes `elementKind`
 * and `category` from the stored document, never from the request body.
 */
export const elementCommentSchema = z.strictObject({
  id: commentIdSchema,
  designId: designIdSchema,
  elementId: itemIdSchema,
  elementKind: elementKindSchema,
  category: categorySchema,
  /** Where on a path or area the person tapped. Items never have one. */
  surfacePoint: localPointSchema.optional(),
  authorId: userIdSchema,
  kind: commentKindSchema,
  /** May be empty: the kind alone counts as a comment. */
  text: plainTextSchema(ELEMENT_COMMENT_MAX_CHARS),
  createdAt: z.iso.datetime(),
  status: commentStatusSchema,
  /** Set by a planner; hidden comments show to planners only. */
  hidden: z.boolean(),
  plannerReply: plannerReplySchema.optional(),
});

/** What a resident sends to add a comment. */
export const newElementCommentSchema = elementCommentSchema.pick({
  elementId: true,
  kind: true,
  text: true,
  surfacePoint: true,
});

export type PlannerReply = z.infer<typeof plannerReplySchema>;
export type ElementComment = z.infer<typeof elementCommentSchema>;
export type NewElementComment = z.infer<typeof newElementCommentSchema>;

/** The design statuses the repositories store. Only a submitted design takes comments. */
export interface CommentTarget {
  readonly status: 'draft' | 'submitted' | 'superseded';
}

/** Residents comment on a submitted design while its project is open. */
export function canComment(phase: ProjectPhase, design: CommentTarget): boolean {
  return phase === 'open' && design.status === 'submitted';
}

/**
 * The author may edit within COMMENT_EDIT_WINDOW_MS of writing. The project must also still be
 * open, which `canComment` checks.
 */
export function canEdit(comment: ElementComment, viewerId: string, now: Date): boolean {
  const ageMs = now.getTime() - Date.parse(comment.createdAt);
  return comment.authorId === viewerId && ageMs <= COMMENT_EDIT_WINDOW_MS;
}

/** Planners resolve, reply to and hide comments, in any phase. */
export function canModerate(role: 'resident' | 'staff'): boolean {
  return role === 'staff';
}
