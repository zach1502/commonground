import { and, asc, count, eq, type SQL } from 'drizzle-orm';

import { COMMENT_KINDS, elementKindSchema, type ElementComment } from '@parkshape/core';

import type {
  CommentChange,
  CommentEdit,
  CommentListOptions,
  CommentResolve,
  CommentVisibility,
  ElementCommentCount,
  ElementCommentRepository,
  OpenComment,
  UpsertedComment,
} from '../../ports/element-comment-repository.js';
import type { RepositoryDeps } from '../../ports/records.js';

import {
  commentOf,
  editCommentStatement,
  upsertCommentStatements,
} from './element-comment-upsert.js';
import type { DrizzleDb } from './pglite.js';
import { designs, elementComments } from './schema/index.js';

const ELEMENT_KIND_ORDER: readonly string[] = elementKindSchema.options;
const COMMENT_KIND_ORDER: readonly string[] = COMMENT_KINDS;

function byCountKey(left: ElementCommentCount, right: ElementCommentCount): number {
  if (left.designId !== right.designId) return left.designId < right.designId ? -1 : 1;
  return (
    ELEMENT_KIND_ORDER.indexOf(left.elementKind) - ELEMENT_KIND_ORDER.indexOf(right.elementKind) ||
    COMMENT_KIND_ORDER.indexOf(left.kind) - COMMENT_KIND_ORDER.indexOf(right.kind)
  );
}

/** The filter a list adds for residents, who never read hidden comments. */
function visibleFilter(options: CommentListOptions): SQL | undefined {
  return options.hidden === 'include' ? undefined : eq(elementComments.hidden, false);
}

function changeOf(row: typeof elementComments.$inferSelect | undefined): CommentChange {
  return row === undefined ? { kind: 'missing' } : { kind: 'changed', comment: commentOf(row) };
}

export class DrizzleElementCommentRepository implements ElementCommentRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly deps: RepositoryDeps,
  ) {}

  /** One statement when nothing races it; see element-comment-upsert.ts. */
  upsertOpen(input: OpenComment): Promise<UpsertedComment> {
    return upsertCommentStatements(this.db, {
      input,
      id: this.deps.newId(),
      now: this.deps.clock.now(),
    });
  }

  async edit(input: CommentEdit): Promise<CommentChange> {
    const comment = await editCommentStatement(this.db, { input, now: this.deps.clock.now() });
    return comment === undefined ? { kind: 'missing' } : { kind: 'changed', comment };
  }

  async resolve(input: CommentResolve): Promise<CommentChange> {
    const now = this.deps.clock.now();
    const reply = input.reply === undefined ? {} : { replyText: input.reply, repliedAt: now };
    const [row] = await this.db
      .update(elementComments)
      .set({ status: 'resolved', updatedAt: now, ...reply })
      .where(eq(elementComments.id, input.commentId))
      .returning();
    return changeOf(row);
  }

  async setHidden(input: CommentVisibility): Promise<CommentChange> {
    const [row] = await this.db
      .update(elementComments)
      .set({ hidden: input.hidden, updatedAt: this.deps.clock.now() })
      .where(eq(elementComments.id, input.commentId))
      .returning();
    return changeOf(row);
  }

  async findById(commentId: string): Promise<ElementComment | undefined> {
    const [row] = await this.db
      .select()
      .from(elementComments)
      .where(eq(elementComments.id, commentId));
    return row === undefined ? undefined : commentOf(row);
  }

  async listByDesign(designId: string, options: CommentListOptions): Promise<ElementComment[]> {
    const rows = await this.db
      .select()
      .from(elementComments)
      .where(and(eq(elementComments.designId, designId), visibleFilter(options)))
      .orderBy(asc(elementComments.createdAt), asc(elementComments.id));
    return rows.map(commentOf);
  }

  async listByProject(projectId: string, options: CommentListOptions): Promise<ElementComment[]> {
    const rows = await this.db
      .select({ comment: elementComments })
      .from(elementComments)
      .innerJoin(designs, eq(designs.id, elementComments.designId))
      .where(and(eq(designs.projectId, projectId), visibleFilter(options)))
      .orderBy(
        asc(elementComments.designId),
        asc(elementComments.createdAt),
        asc(elementComments.id),
      );
    return rows.map((row) => commentOf(row.comment));
  }

  async countsByProject(projectId: string): Promise<ElementCommentCount[]> {
    const { designId, elementKind, kind } = elementComments;
    const rows = await this.db
      .select({ designId, elementKind, kind, count: count() })
      .from(elementComments)
      .innerJoin(designs, eq(designs.id, designId))
      .where(and(eq(designs.projectId, projectId), eq(elementComments.hidden, false)))
      .groupBy(designId, elementKind, kind);
    return rows.sort(byCountKey);
  }
}
