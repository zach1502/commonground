import type {
  Category,
  CommentKind,
  ElementComment,
  ElementKind,
  LocalPoint,
} from '@parkshape/core';

/**
 * A resident's comment on one element of a design. The service has already checked the text
 * and taken the element kind and category from the stored document with `resolveAnchor`.
 */
export interface OpenComment {
  readonly designId: string;
  readonly authorId: string;
  readonly elementId: string;
  readonly elementKind: ElementKind;
  readonly category: Category;
  /** Paths and areas only. */
  readonly surfacePoint?: LocalPoint | undefined;
  readonly kind: CommentKind;
  readonly text: string;
}

export interface UpsertedComment {
  readonly comment: ElementComment;
  /** `updated`: the author already had an open comment of this kind on the element. */
  readonly outcome: 'created' | 'updated';
}

export interface CommentEdit {
  readonly commentId: string;
  readonly text: string;
}

export interface CommentResolve {
  readonly commentId: string;
  /** The planner's reply; left out, any earlier reply stays. */
  readonly reply?: string | undefined;
}

export interface CommentVisibility {
  readonly commentId: string;
  readonly hidden: boolean;
}

/** `missing`: no comment has the id. */
export type CommentChange =
  { readonly kind: 'changed'; readonly comment: ElementComment } | { readonly kind: 'missing' };

/** `exclude` for residents; planners read hidden comments too. */
export interface CommentListOptions {
  readonly hidden: 'include' | 'exclude';
}

/** How many comments of one kind a design's elements of one kind drew. */
export interface ElementCommentCount {
  readonly designId: string;
  readonly elementKind: ElementKind;
  readonly kind: CommentKind;
  readonly count: number;
}

/**
 * Comments on the elements of submitted designs. One open comment per author, element and
 * kind; many per person per design. Returns ElementComment domain values, never rows.
 */
export interface ElementCommentRepository {
  /**
   * Creates the comment, or replaces the text of the author's open comment of the same kind on
   * the same element. Throws MissingReferenceError for an unknown design or author, and
   * PhaseClosedError, writing nothing, when the project is closed as the write runs.
   */
  upsertOpen(input: OpenComment): Promise<UpsertedComment>;
  /** Replaces the text. Throws PhaseClosedError, writing nothing, when the project is closed. */
  edit(input: CommentEdit): Promise<CommentChange>;
  /** Marks the comment resolved, with the planner's reply when given, in any phase. */
  resolve(input: CommentResolve): Promise<CommentChange>;
  /** Hides or shows the comment, in any phase. */
  setHidden(input: CommentVisibility): Promise<CommentChange>;
  /** The comment with this id, hidden or not. */
  findById(commentId: string): Promise<ElementComment | undefined>;
  /** The design's comments, oldest first, then by id. */
  listByDesign(designId: string, options: CommentListOptions): Promise<ElementComment[]>;
  /** Every comment on the project's designs, by design id, then oldest first, then by id. */
  listByProject(projectId: string, options: CommentListOptions): Promise<ElementComment[]>;
  /**
   * Counts of the comments that are not hidden, open or resolved. Sorted by design id, then
   * element kind in elementKindSchema order, then comment kind in COMMENT_KINDS order.
   */
  countsByProject(projectId: string): Promise<ElementCommentCount[]>;
}
