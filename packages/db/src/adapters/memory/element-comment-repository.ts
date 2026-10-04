import {
  COMMENT_KINDS,
  elementCommentSchema,
  elementKindSchema,
  type ElementComment,
} from '@parkshape/core';

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
import { MissingReferenceError, PhaseClosedError } from '../../ports/repositories.js';

import { projectOpenNow } from './guarded-writes.js';
import type { InMemoryStore } from './store.js';

const ELEMENT_KIND_ORDER: readonly string[] = elementKindSchema.options;
const COMMENT_KIND_ORDER: readonly string[] = COMMENT_KINDS;

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// ISO timestamps from one clock compare correctly as strings.
function byCreatedThenId(left: ElementComment, right: ElementComment): number {
  return compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}

function byDesignThenCreated(left: ElementComment, right: ElementComment): number {
  return compareText(left.designId, right.designId) || byCreatedThenId(left, right);
}

function byCountKey(left: ElementCommentCount, right: ElementCommentCount): number {
  return (
    compareText(left.designId, right.designId) ||
    ELEMENT_KIND_ORDER.indexOf(left.elementKind) - ELEMENT_KIND_ORDER.indexOf(right.elementKind) ||
    COMMENT_KIND_ORDER.indexOf(left.kind) - COMMENT_KIND_ORDER.indexOf(right.kind)
  );
}

function visibleTo(options: CommentListOptions): (comment: ElementComment) => boolean {
  return (comment) => options.hidden === 'include' || !comment.hidden;
}

export class InMemoryElementCommentRepository implements ElementCommentRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly deps: RepositoryDeps,
  ) {}

  // Runs without awaiting, so the phase read and the write happen in one turn of the event loop.
  upsertOpen(input: OpenComment): Promise<UpsertedComment> {
    if (!this.store.users.has(input.authorId)) {
      return Promise.reject(new MissingReferenceError(`user ${input.authorId}`));
    }
    const refusal = this.closedRefusal(input.designId);
    if (refusal !== undefined) return Promise.reject(refusal);
    const previous = this.findOpen(input);
    const comment = elementCommentSchema.parse({
      ...(previous ?? this.freshFields()),
      designId: input.designId,
      authorId: input.authorId,
      elementId: input.elementId,
      elementKind: input.elementKind,
      category: input.category,
      ...(input.surfacePoint === undefined ? {} : { surfacePoint: input.surfacePoint }),
      kind: input.kind,
      text: input.text,
    });
    this.store.elementComments.set(comment.id, comment);
    return Promise.resolve({ comment, outcome: previous === undefined ? 'created' : 'updated' });
  }

  edit(input: CommentEdit): Promise<CommentChange> {
    const existing = this.store.elementComments.get(input.commentId);
    if (existing === undefined) return Promise.resolve({ kind: 'missing' });
    const refusal = this.closedRefusal(existing.designId);
    if (refusal !== undefined) return Promise.reject(refusal);
    return Promise.resolve(this.save({ ...existing, text: input.text }));
  }

  resolve(input: CommentResolve): Promise<CommentChange> {
    const existing = this.store.elementComments.get(input.commentId);
    if (existing === undefined) return Promise.resolve({ kind: 'missing' });
    const repliedAt = this.deps.clock.now().toISOString();
    const reply =
      input.reply === undefined ? {} : { plannerReply: { text: input.reply, repliedAt } };
    return Promise.resolve(this.save({ ...existing, status: 'resolved', ...reply }));
  }

  setHidden(input: CommentVisibility): Promise<CommentChange> {
    const existing = this.store.elementComments.get(input.commentId);
    if (existing === undefined) return Promise.resolve({ kind: 'missing' });
    return Promise.resolve(this.save({ ...existing, hidden: input.hidden }));
  }

  findById(commentId: string): Promise<ElementComment | undefined> {
    return Promise.resolve(this.store.elementComments.get(commentId));
  }

  listByDesign(designId: string, options: CommentListOptions): Promise<ElementComment[]> {
    const comments = [...this.store.elementComments.values()]
      .filter((comment) => comment.designId === designId)
      .filter(visibleTo(options));
    return Promise.resolve(comments.sort(byCreatedThenId));
  }

  listByProject(projectId: string, options: CommentListOptions): Promise<ElementComment[]> {
    return Promise.resolve(
      this.inProject(projectId).filter(visibleTo(options)).sort(byDesignThenCreated),
    );
  }

  countsByProject(projectId: string): Promise<ElementCommentCount[]> {
    const counts = new Map<string, ElementCommentCount>();
    for (const comment of this.inProject(projectId).filter((entry) => !entry.hidden)) {
      const key = `${comment.designId}|${comment.elementKind}|${comment.kind}`;
      const count = (counts.get(key)?.count ?? 0) + 1;
      const { designId, elementKind, kind } = comment;
      counts.set(key, { designId, elementKind, kind, count });
    }
    return Promise.resolve([...counts.values()].sort(byCountKey));
  }

  private inProject(projectId: string): ElementComment[] {
    return [...this.store.elementComments.values()].filter(
      (comment) => this.store.designs.get(comment.designId)?.projectId === projectId,
    );
  }

  /** The error a resident write on this design answers now, or undefined when it may go ahead. */
  private closedRefusal(designId: string): Error | undefined {
    const design = this.store.designs.get(designId);
    if (design === undefined) return new MissingReferenceError(`design ${designId}`);
    if (!projectOpenNow(this.store, design.projectId, this.deps.clock)) {
      return new PhaseClosedError(`design ${designId}`);
    }
    return undefined;
  }

  private findOpen(input: OpenComment): ElementComment | undefined {
    return [...this.store.elementComments.values()].find(
      (comment) =>
        comment.status === 'open' &&
        comment.designId === input.designId &&
        comment.authorId === input.authorId &&
        comment.elementId === input.elementId &&
        comment.kind === input.kind,
    );
  }

  private freshFields() {
    return {
      id: this.deps.newId(),
      createdAt: this.deps.clock.now().toISOString(),
      status: 'open',
      hidden: false,
    } as const;
  }

  private save(next: ElementComment): CommentChange {
    const comment = elementCommentSchema.parse(next);
    this.store.elementComments.set(comment.id, comment);
    return { kind: 'changed', comment };
  }
}
