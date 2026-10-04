import type { Category, VoteReason } from '@parkshape/core';

/**
 * Inputs to the summary. packages/core has no insights module yet (Task 16), so these are the
 * smallest shapes the summary needs. Swap them for the core types once that module lands.
 */

/** One top design reduced to counts, so no prompt ever carries a raw design document. */
export interface DesignDigest {
  readonly id: string;
  readonly score: number;
  /** Placed items, areas and paths by catalog category. Missing categories count as 0. */
  readonly categoryCounts: Readonly<Partial<Record<Category, number>>>;
}

/** The project counts the insights endpoint reports today. */
export interface InsightCounts {
  readonly designs: number;
  readonly votes: number;
  readonly uniqueVoters: number;
}

/** How often voters picked each reason. Missing reasons count as 0. */
export type ReasonCounts = Readonly<Partial<Record<VoteReason, number>>>;

/** One element name and the visible comments residents left on it across the project. */
export interface CommentedElement {
  readonly label: string;
  readonly comments: number;
}

/** Element comments across the project, so the summary can say where residents pointed. */
export interface ElementFeedbackDigest {
  readonly comments: number;
  /** Most commented first. */
  readonly topElements: readonly CommentedElement[];
}

export interface SummaryInput {
  /** Ranked best first, at most the top 10. */
  readonly topDesigns: readonly DesignDigest[];
  readonly insights: InsightCounts;
  readonly reasonCounts: ReasonCounts;
  readonly elementFeedback: ElementFeedbackDigest;
}
