import type { ElementFeedbackDigest } from '@parkshape/ai';
import {
  catalogIndex,
  elementLabel,
  elementKindSchema,
  type DesignDocument,
  type ElementComment,
  type Parcel,
} from '@parkshape/core';
import type { Design, Project } from '@parkshape/db';

import type { ElementFeedback } from '../contracts/element-comments.js';
import type { AppDeps } from '../deps.js';

import { loadProject, storedDocument, storedParcel } from './access.js';
import {
  compareElements,
  compareText,
  emptyKindCounts,
  labelOf,
} from './element-comment-groups.js';

const LINE_END = '\r\n';

export const ELEMENT_COMMENT_CSV_HEADER: readonly string[] = [
  'design_title',
  'element_kind',
  'category',
  'element_label',
  'element_id',
  'comment_kind',
  'text',
  'status',
  'reply',
  'created_at',
];

// A leading =, +, - or @ makes a spreadsheet run the cell as a formula.
const FORMULA_START = /^[=+\-@]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** Quotes a field when needed and defuses spreadsheet formulas in resident text. */
function csvText(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) || safe !== value ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Each design the comments name, read once. */
async function designsOf(
  deps: AppDeps,
  designIds: readonly string[],
): Promise<Map<string, Design>> {
  const found = await Promise.all(
    [...new Set(designIds)].map((id) => deps.repos.designs.findById(id)),
  );
  return new Map(found.flatMap((design) => (design === undefined ? [] : [[design.id, design]])));
}

/** Visible comments per design, by element kind and comment kind, most commented first. */
export async function elementFeedback(deps: AppDeps, projectId: string): Promise<ElementFeedback> {
  const project = await loadProject(deps.repos, projectId);
  const counts = await deps.repos.elementComments.countsByProject(project.id);
  const designs = await designsOf(
    deps,
    counts.map((count) => count.designId),
  );
  const byDesign = new Map<string, ElementFeedback['designs'][number]>();
  for (const { designId, elementKind, kind, count } of counts) {
    const entry = byDesign.get(designId) ?? {
      designId,
      title: designs.get(designId)?.title ?? '',
      total: 0,
      byElementKind: Object.fromEntries(elementKindSchema.options.map((key) => [key, 0])) as Record<
        (typeof elementKindSchema.options)[number],
        number
      >,
      byKind: emptyKindCounts(),
    };
    entry.total += count;
    entry.byElementKind[elementKind] += count;
    entry.byKind[kind] += count;
    byDesign.set(designId, entry);
  }
  const ranked = [...byDesign.values()].sort(
    (left, right) =>
      right.total - left.total ||
      compareText(left.title, right.title) ||
      compareText(left.designId, right.designId),
  );
  return { total: ranked.reduce((sum, entry) => sum + entry.total, 0), designs: ranked };
}

// The summary names the top element only; a few more keep the input small and its order clear.
const SUMMARY_TOP_ELEMENTS = 3;

/** The catalog name of a comment's element, such as Bench, or its id when it has none. */
function elementNameOf(
  document: DesignDocument | undefined,
  parcel: Parcel,
  comment: ElementComment,
): string {
  if (document === undefined) return comment.elementId;
  const ref = { elementId: comment.elementId, elementKind: comment.elementKind };
  return (
    elementLabel(document, catalogIndex, { ref, parcel: parcel.polygon })?.name ?? comment.elementId
  );
}

/**
 * Visible comments across the project and the element names residents commented on most,
 * by catalog name so 3 benches in 3 designs read as Bench. The AI summary's comment line.
 */
export async function elementFeedbackDigest(
  deps: AppDeps,
  project: Project,
): Promise<ElementFeedbackDigest> {
  const comments = await deps.repos.elementComments.listByProject(project.id, {
    hidden: 'exclude',
  });
  const designs = await designsOf(
    deps,
    comments.map((comment) => comment.designId),
  );
  const parcel = storedParcel(project);
  const documents = new Map(
    [...designs.values()].map((design) => [design.id, storedDocument(design)]),
  );
  const byName = new Map<string, number>();
  for (const comment of comments) {
    const name = elementNameOf(documents.get(comment.designId), parcel, comment);
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  const topElements = [...byName]
    .map(([label, count]) => ({ label, comments: count }))
    .sort((left, right) => right.comments - left.comments || compareText(left.label, right.label))
    .slice(0, SUMMARY_TOP_ELEMENTS);
  return { comments: comments.length, topElements };
}

interface CsvRow {
  readonly design: Design;
  readonly label: string;
  readonly comment: ElementComment;
}

function compareRows(left: CsvRow, right: CsvRow): number {
  return (
    compareText(left.design.title, right.design.title) ||
    compareText(left.design.id, right.design.id) ||
    compareElements(
      { ...left.comment, label: left.label },
      { ...right.comment, label: right.label },
    ) ||
    compareText(left.comment.createdAt, right.comment.createdAt) ||
    compareText(left.comment.id, right.comment.id)
  );
}

function csvLine({ design, label, comment }: CsvRow): string {
  return [
    csvText(design.title),
    comment.elementKind,
    comment.category,
    csvText(label),
    csvText(comment.elementId),
    comment.kind,
    csvText(comment.text),
    comment.status,
    csvText(comment.plannerReply?.text ?? ''),
    comment.createdAt,
  ].join(',');
}

function* csvLines(rows: readonly CsvRow[]): Generator<string> {
  yield ELEMENT_COMMENT_CSV_HEADER.join(',') + LINE_END;
  for (const row of rows) yield csvLine(row) + LINE_END;
}

/**
 * The project's visible element comments as CSV chunks, sorted by design, element kind,
 * category and label. Author names are left out; hidden comments stay out of the file.
 */
export async function elementCommentCsvChunks(
  deps: AppDeps,
  projectId: string,
): Promise<Iterable<string>> {
  const project = await loadProject(deps.repos, projectId);
  const comments = await deps.repos.elementComments.listByProject(project.id, {
    hidden: 'exclude',
  });
  const designs = await designsOf(
    deps,
    comments.map((comment) => comment.designId),
  );
  const parcel = storedParcel(project).polygon;
  const documents = new Map(
    [...designs.values()].map((design) => [design.id, storedDocument(design)]),
  );
  const rows = comments.flatMap((comment) => {
    const design = designs.get(comment.designId);
    const document = documents.get(comment.designId);
    if (design === undefined || document === undefined) return [];
    return [{ design, comment, label: labelOf(document, parcel, comment) }];
  });
  return csvLines(rows.sort(compareRows));
}
