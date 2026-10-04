import { anchorPoint, type DesignDocument, type Parcel, type PlanePoint } from '@parkshape/core';

import type { Design } from '../../api/web-api';
import type {
  DesignFeedback,
  ElementComments,
  PlannerReviewApi,
  ReviewApi,
} from '../review/review-api';

export type { DesignFeedback, ElementComments };

/** What the section reads and writes: the counts, a design's comments and its drawing. */
export type FeedbackApi = PlannerReviewApi &
  Pick<ReviewApi, 'listComments'> & {
    readonly getDesign: (designId: string) => Promise<Design>;
  };

type CommentKind = keyof DesignFeedback['byKind'];

/** The element and comment kind that drew the most comments on the design. */
export interface ActiveTitle {
  readonly label: string;
  readonly kind: CommentKind;
  readonly count: number;
}

function kindsOf(group: ElementComments): [CommentKind, number][] {
  return Object.entries(group.counts) as [CommentKind, number][];
}

/** Ties keep the earlier element and the earlier kind, so the title does not flicker. */
export function activeTitle(groups: readonly ElementComments[]): ActiveTitle | undefined {
  let best: ActiveTitle | undefined;
  for (const group of groups) {
    for (const [kind, count] of kindsOf(group)) {
      if (count > (best?.count ?? 0)) best = { label: group.label, kind, count };
    }
  }
  return best;
}

export function visibleCount(group: ElementComments): number {
  return kindsOf(group).reduce((sum, [, count]) => sum + count, 0);
}

/** One numbered mark on the comment map. */
export interface CommentMark {
  readonly rank: number;
  readonly elementId: string;
  readonly label: string;
  readonly count: number;
  readonly at: PlanePoint;
  /** 1 to 5, darker with more comments. */
  readonly shade: number;
}

export const MARK_LIMIT = 10;
const SHADE_STEPS = 5;

/** The 10 most commented elements, most first, then by label, each at its anchor point. */
export function commentMarks(
  document: DesignDocument,
  groups: readonly ElementComments[],
): CommentMark[] {
  const ranked = groups
    .map((group) => ({ group, count: visibleCount(group) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.group.label.localeCompare(b.group.label))
    .slice(0, MARK_LIMIT);
  const most = ranked[0]?.count ?? 1;
  return ranked.flatMap(({ group, count }, index) => {
    const at = anchorPoint(document, { elementId: group.elementId });
    if (at === undefined) return [];
    const shade = Math.max(1, Math.ceil((count / most) * SHADE_STEPS));
    return [{ rank: index + 1, elementId: group.elementId, label: group.label, count, at, shade }];
  });
}

/** Metres around the parcel in the plan drawing; the poster uses the same margin. */
const POSTER_MARGIN_M = 4;
const SIDES = 2;

/** The plan poster's frame in plan metres with y flipped, so marks sit on the drawing. */
export function posterFrame(parcel: Parcel) {
  const xs = parcel.polygon.map((point) => point.x);
  const ys = parcel.polygon.map((point) => 0 - point.y);
  const left = Math.min(...xs) - POSTER_MARGIN_M;
  const top = Math.min(...ys) - POSTER_MARGIN_M;
  const width = Math.max(...xs) - Math.min(...xs) + POSTER_MARGIN_M * SIDES;
  const height = Math.max(...ys) - Math.min(...ys) + POSTER_MARGIN_M * SIDES;
  return { left, top, width, height };
}
