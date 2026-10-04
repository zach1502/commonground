import { z } from 'zod';

import { commentKindSchema, type CommentKind, type DesignDocument } from '@parkshape/core';

import type { SeedPersona } from './personas.js';
import { readSeedJson } from './seed-files.js';

const COMMENTS_FILE = 'comments.json';

const elementPickSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('item'), catalogId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('path') }),
  z.strictObject({ kind: z.literal('area'), catalogId: z.string().min(1) }),
]);

const seedCommentSchema = z.strictObject({
  design: z.string().min(1),
  element: elementPickSchema,
  kind: commentKindSchema,
  text: z.string(),
  resident: z.int().nonnegative(),
});

const seedCommentFileSchema = z.strictObject({
  $comment: z.string(),
  comments: z.array(seedCommentSchema),
});

export type SeedComment = z.infer<typeof seedCommentSchema>;
type ElementPick = z.infer<typeof elementPickSchema>;

/** A submitted design as the comment plan sees it. */
export interface CommentedDesign {
  readonly id: string;
  readonly title: string;
  readonly authorId: string;
  readonly document: DesignDocument;
}

export interface PlannedComment {
  readonly designId: string;
  readonly authorId: string;
  readonly elementId: string;
  readonly kind: CommentKind;
  readonly text: string;
}

export interface SeedCommentTargets {
  readonly designs: readonly CommentedDesign[];
  readonly residents: readonly SeedPersona[];
}

/** The hand-written comments in packages/db/seed/comments.json. */
export function loadSeedComments(): SeedComment[] {
  return seedCommentFileSchema.parse(readSeedJson(COMMENTS_FILE)).comments;
}

function pickElement(document: DesignDocument, pick: ElementPick): string | undefined {
  if (pick.kind === 'path') return document.paths[0]?.id;
  const elements = pick.kind === 'item' ? document.items : document.areas;
  return elements.find((element) => element.catalogId === pick.catalogId)?.id;
}

function pickName(pick: ElementPick): string {
  return pick.kind === 'path' ? 'path' : pick.catalogId;
}

/** The first resident from the named index on who did not draw the design. */
function commenter(residents: readonly SeedPersona[], index: number, authorId: string) {
  const found = [...residents.slice(index), ...residents.slice(0, index)].find(
    (resident) => resident.id !== authorId,
  );
  if (found === undefined) throw new Error('The seed has no resident to comment');
  return found;
}

/**
 * The seed comments on the stored designs. A missing design or element throws, so a change to
 * the showcase that breaks a comment shows at once instead of seeding fewer.
 */
export function planSeedComments(
  comments: readonly SeedComment[],
  targets: SeedCommentTargets,
): PlannedComment[] {
  const byTitle = new Map(targets.designs.map((design) => [design.title, design]));
  return comments.map((comment) => {
    const design = byTitle.get(comment.design);
    if (design === undefined) throw new Error(`No seed design for comment: ${comment.design}`);
    const elementId = pickElement(design.document, comment.element);
    if (elementId === undefined) {
      throw new Error(`${comment.design} has no ${pickName(comment.element)} to comment on`);
    }
    const author = commenter(targets.residents, comment.resident, design.authorId);
    return {
      designId: design.id,
      authorId: author.id,
      elementId,
      kind: comment.kind,
      text: comment.text,
    };
  });
}
