import {
  COMMENT_KINDS,
  canEdit,
  catalogIndex,
  elementKindSchema,
  elementLabel,
  formatElementLabel,
  type CommentKind,
  type DesignDocument,
  type ElementComment,
  type PlanePoint,
  type ProjectPhase,
} from '@parkshape/core';
import type { Repositories } from '@parkshape/db';

import type { CommentRecord, DesignComments } from '../contracts/element-comments.js';

type ElementGroup = DesignComments['elements'][number];

const ELEMENT_KIND_ORDER: readonly string[] = elementKindSchema.options;
// Shown for a person whose user row is gone, which the foreign key should never allow.
const UNKNOWN_AUTHOR = 'A resident';

/** Who reads the comments and when, which decides `mine` and `editable`. */
export interface CommentViewer {
  readonly viewerId: string | undefined;
  readonly now: Date;
  readonly phase: ProjectPhase;
  readonly names: ReadonlyMap<string, string>;
}

/** The display names of the comments' authors, read once per author. */
export async function authorNames(
  repos: Repositories,
  comments: readonly ElementComment[],
): Promise<Map<string, string>> {
  const ids = [...new Set(comments.map((comment) => comment.authorId))];
  const users = await Promise.all(ids.map((id) => repos.users.findById(id)));
  return new Map(
    users.flatMap((user) => (user === undefined ? [] : [[user.id, user.displayName]])),
  );
}

export function presentComment(comment: ElementComment, viewer: CommentViewer): CommentRecord {
  const { viewerId } = viewer;
  const mine = viewerId === comment.authorId;
  const editable =
    viewerId === comment.authorId &&
    viewer.phase === 'open' &&
    canEdit(comment, viewerId, viewer.now);
  return {
    id: comment.id,
    designId: comment.designId,
    elementId: comment.elementId,
    elementKind: comment.elementKind,
    category: comment.category,
    kind: comment.kind,
    text: comment.text,
    status: comment.status,
    hidden: comment.hidden,
    createdAt: comment.createdAt,
    surfacePoint: comment.surfacePoint ?? null,
    plannerReply: comment.plannerReply ?? null,
    author: { displayName: viewer.names.get(comment.authorId) ?? UNKNOWN_AUTHOR },
    mine,
    editable,
  };
}

/** Zero of every comment kind, in COMMENT_KINDS order. */
export function emptyKindCounts(): Record<CommentKind, number> {
  return Object.fromEntries(COMMENT_KINDS.map((kind) => [kind, 0])) as Record<CommentKind, number>;
}

/** The element as the CSV and the UI name it, such as "Bench, south-west"; else its id. */
export function labelOf(
  document: DesignDocument,
  parcel: readonly PlanePoint[],
  comment: Pick<ElementComment, 'elementId' | 'elementKind'>,
): string {
  const ref = { elementId: comment.elementId, elementKind: comment.elementKind };
  const label = elementLabel(document, catalogIndex, { ref, parcel });
  return label === undefined ? comment.elementId : formatElementLabel(label);
}

/** Code-unit order, the same on every runtime and locale. */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Element kind in elementKindSchema order, then category, label and element id. */
export function compareElements(
  left: Pick<ElementGroup, 'elementKind' | 'category' | 'label' | 'elementId'>,
  right: Pick<ElementGroup, 'elementKind' | 'category' | 'label' | 'elementId'>,
): number {
  return (
    ELEMENT_KIND_ORDER.indexOf(left.elementKind) - ELEMENT_KIND_ORDER.indexOf(right.elementKind) ||
    compareText(left.category, right.category) ||
    compareText(left.label, right.label) ||
    compareText(left.elementId, right.elementId)
  );
}

function addToGroup(group: ElementGroup, comment: ElementComment, record: CommentRecord) {
  group.comments.push(record);
  if (comment.hidden) return;
  group.counts[comment.kind] += 1;
  if (comment.status === 'open') group.openCount += 1;
}

interface GroupInput {
  readonly document: DesignDocument;
  readonly parcel: readonly PlanePoint[];
  readonly comments: readonly ElementComment[];
  readonly viewer: CommentViewer;
}

/** The comments, oldest first within each element, grouped by element. */
export function groupByElement({ document, parcel, comments, viewer }: GroupInput): ElementGroup[] {
  const groups = new Map<string, ElementGroup>();
  for (const comment of comments) {
    const group = groups.get(comment.elementId) ?? {
      elementId: comment.elementId,
      elementKind: comment.elementKind,
      category: comment.category,
      label: labelOf(document, parcel, comment),
      counts: emptyKindCounts(),
      openCount: 0,
      comments: [],
    };
    groups.set(comment.elementId, group);
    addToGroup(group, comment, presentComment(comment, viewer));
  }
  return [...groups.values()].sort(compareElements);
}
