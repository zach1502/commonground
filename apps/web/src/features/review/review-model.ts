import {
  catalogIndex,
  categorySchema,
  resolveAnchor,
  designDocumentSchema,
  parcelSchema,
  COMMENT_EDIT_WINDOW_MS,
  elementLabel,
  formatElementLabel,
  type Category,
  type DesignDocument,
  type ElementKind,
  type ElementRef,
  type Parcel,
  type ProjectPhase,
} from '@parkshape/core';

import type { ReviewComment } from './review-api';

/** One element of the design as the Elements list and the composer name it. */
export interface ElementEntry {
  readonly ref: ElementRef;
  /** The catalog name, such as Bench. */
  readonly name: string;
  /** Name and compass zone, such as "Bench, south-west". */
  readonly label: string;
  /** The catalog category, such as seating, for the list's filter. */
  readonly category: Category;
}

export const ELEMENT_KINDS: readonly ElementKind[] = ['item', 'path', 'area'];

/** Every item, path and area in the design, items first, each in document order. */
export function elementEntries(document: DesignDocument, parcel: Parcel): ElementEntry[] {
  const refs: ElementRef[] = [
    ...document.items.map((item) => ({ elementId: item.id, elementKind: 'item' as const })),
    ...document.paths.map((path) => ({ elementId: path.id, elementKind: 'path' as const })),
    ...document.areas.map((area) => ({ elementId: area.id, elementKind: 'area' as const })),
  ];
  return refs.flatMap((ref) => {
    const label = elementLabel(document, catalogIndex, { ref, parcel: parcel.polygon });
    const anchor = resolveAnchor(document, catalogIndex, { elementId: ref.elementId });
    if (label === undefined || !anchor.ok) return [];
    const { category } = anchor.value;
    return [{ ref, name: label.name, label: formatElementLabel(label), category }];
  });
}

/** The Elements list shows every element, or one category of them. */
export type CategoryFilter = Category | 'all';

/** The categories the design has, in catalog order, with how many elements each holds. */
export function categoryCounts(
  entries: readonly ElementEntry[],
): { readonly category: Category; readonly count: number }[] {
  return categorySchema.options.flatMap((category) => {
    const count = entries.filter((entry) => entry.category === category).length;
    return count === 0 ? [] : [{ category, count }];
  });
}

export function entriesIn(entries: readonly ElementEntry[], filter: CategoryFilter) {
  return filter === 'all' ? entries : entries.filter((entry) => entry.category === filter);
}

/** Item names with their zone by id, such as "Bench, south-west", for the walk's Near line. */
export function itemLabels(
  design: { readonly document: unknown },
  project: { readonly parcel: unknown },
): ReadonlyMap<string, string> {
  const document = designDocumentSchema.parse(design.document);
  const entries = elementEntries(document, parcelSchema.parse(project.parcel));
  return new Map(
    entries
      .filter((entry) => entry.ref.elementKind === 'item')
      .map((entry) => [entry.ref.elementId, entry.label]),
  );
}

/** Open comments per element id; a resolved comment no longer counts on a chip or a row. */
export function commentCounts(comments: readonly ReviewComment[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  comments
    .filter((comment) => comment.status === 'open')
    .forEach((comment) => counts.set(comment.elementId, (counts.get(comment.elementId) ?? 0) + 1));
  return counts;
}

const RELATIVE = new Intl.RelativeTimeFormat('en-CA', { numeric: 'auto' });
const SIXTY = 60;
const HOURS_PER_DAY = 24;
const STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['second', SIXTY],
  ['minute', SIXTY],
  ['hour', HOURS_PER_DAY],
  ['day', Infinity],
];
const MS_PER_SECOND = 1000;

/** How long ago a comment was written, such as "5 minutes ago", from the clock's now. */
export function relativeTime(createdAt: string, now: Date): string {
  let amount = Math.max(0, Math.round((now.getTime() - Date.parse(createdAt)) / MS_PER_SECOND));
  for (const [unit, perNext] of STEPS) {
    if (amount < perNext) return RELATIVE.format(-amount, unit);
    amount = Math.floor(amount / perNext);
  }
  return RELATIVE.format(-amount, 'day');
}

/** When and in which phase the comment is read, for the Edit rule. */
export interface EditViewer {
  readonly now: Date;
  readonly phase: ProjectPhase;
}

/**
 * The server marks the caller's own comment editable; the page still drops Edit once
 * COMMENT_EDIT_WINDOW_MS has passed on its clock or the project has closed.
 */
export function canEditComment(comment: ReviewComment, viewer: EditViewer): boolean {
  const ageMs = viewer.now.getTime() - Date.parse(comment.createdAt);
  return comment.editable && viewer.phase === 'open' && ageMs <= COMMENT_EDIT_WINDOW_MS;
}
