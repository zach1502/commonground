import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { categorySchema, elementCommentSchema, type ElementComment } from '@parkshape/core';

import type {
  CommentEdit,
  OpenComment,
  UpsertedComment,
} from '../../ports/element-comment-repository.js';
import { MissingReferenceError, PhaseClosedError } from '../../ports/repositories.js';

import { resultRows } from './migrations.js';
import type { DrizzleDb } from './pglite.js';
import type { elementComments } from './schema/index.js';
import { openProject, refuseIfClosed } from './vote-upsert.js';

// Foreign key violation: the comment names a person who does not exist.
const FOREIGN_KEY_VIOLATION = '23503';

type CommentRow = typeof elementComments.$inferSelect;

// Drivers return timestamps as text under raw SQL, which drizzle maps itself for typed queries.
const timestamp = z.union([z.date(), z.string()]).transform((value) => new Date(value));

const rawRowSchema = z
  .object({
    id: z.string(),
    design_id: z.string(),
    element_id: z.string(),
    element_kind: z.enum(['item', 'path', 'area']),
    category: categorySchema,
    surface_x: z.number().nullable(),
    surface_y: z.number().nullable(),
    author_id: z.string(),
    kind: z.enum(['keep', 'move', 'change', 'remove', 'question']),
    text: z.string(),
    status: z.enum(['open', 'resolved']),
    hidden: z.boolean(),
    reply_text: z.string().nullable(),
    replied_at: timestamp.nullable(),
    created_at: timestamp,
    updated_at: timestamp,
    outcome: z.enum(['created', 'updated']).optional(),
  })
  .transform((row) => ({
    outcome: row.outcome,
    row: {
      id: row.id,
      designId: row.design_id,
      elementId: row.element_id,
      elementKind: row.element_kind,
      category: row.category,
      surfaceX: row.surface_x,
      surfaceY: row.surface_y,
      authorId: row.author_id,
      kind: row.kind,
      text: row.text,
      status: row.status,
      hidden: row.hidden,
      replyText: row.reply_text,
      repliedAt: row.replied_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }));

/** A stored row as the domain value; the schema checks every field on the way out. */
export function commentOf(row: CommentRow): ElementComment {
  const { surfaceX, surfaceY, replyText, repliedAt } = row;
  return elementCommentSchema.parse({
    id: row.id,
    designId: row.designId,
    elementId: row.elementId,
    elementKind: row.elementKind,
    category: row.category,
    ...(surfaceX === null || surfaceY === null
      ? {}
      : { surfacePoint: { x: surfaceX, y: surfaceY } }),
    authorId: row.authorId,
    kind: row.kind,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    hidden: row.hidden,
    ...(replyText === null || repliedAt === null
      ? {}
      : { plannerReply: { text: replyText, repliedAt: repliedAt.toISOString() } }),
  });
}

export interface CommentStatement {
  readonly input: OpenComment;
  readonly id: string;
  readonly now: Date;
}

function sameOpenComment(input: OpenComment) {
  return sql`design_id = ${input.designId} and author_id = ${input.authorId}
    and element_id = ${input.elementId} and kind = ${input.kind} and status = 'open'`;
}

function surfaceValues(input: OpenComment) {
  return {
    x: sql`${input.surfacePoint?.x ?? null}::double precision`,
    y: sql`${input.surfacePoint?.y ?? null}::double precision`,
  };
}

/**
 * The comment in one statement. The project row is share-locked while it is open, as for votes,
 * so a close that commits first stops the write. FOR UPDATE takes the author's open comment of
 * this kind on this element if there is one, and its text is replaced; otherwise a row is
 * inserted. The partial unique index decides between two first comments at once: the later
 * insert does nothing and returns no row, and the caller runs changeStatement for it.
 */
function upsertStatement({ input, id, now }: CommentStatement) {
  const at = sql`${now.toISOString()}::timestamptz`;
  const surface = surfaceValues(input);
  return sql`
    with open_project as (${openProject(input, now)}), previous as (
      select id from element_comments where ${sameOpenComment(input)}
      for update
    ), inserted as (
      insert into element_comments (id, design_id, element_id, element_kind, category,
        surface_x, surface_y, author_id, kind, text, status, hidden, created_at, updated_at)
      select ${id}, ${input.designId}, ${input.elementId}, ${input.elementKind}, ${input.category},
        ${surface.x}, ${surface.y}, ${input.authorId}, ${input.kind}, ${input.text}, 'open', false,
        ${at}, ${at}
      where not exists (select 1 from previous) and exists (select 1 from open_project)
      on conflict (design_id, element_id, author_id, kind) where status = 'open' do nothing
      returning *, 'created'::text as outcome
    ), changed as (
      update element_comments set text = ${input.text}, surface_x = ${surface.x},
        surface_y = ${surface.y}, updated_at = ${at}
      from previous, open_project where element_comments.id = previous.id
      returning element_comments.*, 'updated'::text as outcome
    )
    select * from inserted union all select * from changed`;
}

/** The text change for the first comment that lost the race above, which has now committed. */
function changeStatement({ input, now }: CommentStatement) {
  const at = sql`${now.toISOString()}::timestamptz`;
  const surface = surfaceValues(input);
  return sql`
    with open_project as (${openProject(input, now)}), previous as (
      select id from element_comments where ${sameOpenComment(input)}
      for update
    )
    update element_comments set text = ${input.text}, surface_x = ${surface.x},
      surface_y = ${surface.y}, updated_at = ${at}
    from previous, open_project where element_comments.id = previous.id
    returning element_comments.*, 'updated'::text as outcome`;
}

function isForeignKeyViolation(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error && error.cause ? error.cause : error;
  const found = z.object({ code: z.string() }).safeParse(cause);
  return found.success && found.data.code === FOREIGN_KEY_VIOLATION;
}

async function firstRow(db: DrizzleDb, query: ReturnType<typeof sql>, input: OpenComment) {
  try {
    const [row] = resultRows(await db.execute(query));
    return row === undefined ? undefined : rawRowSchema.parse(row);
  } catch (error) {
    // The design is checked through open_project, so a violated key is the author's.
    if (isForeignKeyViolation(error)) throw new MissingReferenceError(`user ${input.authorId}`);
    throw error;
  }
}

function upserted(found: NonNullable<Awaited<ReturnType<typeof firstRow>>>): UpsertedComment {
  return { comment: commentOf(found.row), outcome: found.outcome ?? 'updated' };
}

/**
 * Adds or replaces one comment in one statement, or more after a lost race or a close, with no
 * transaction. A statement that wrote nothing is followed by one read of the phase, so a closed
 * project answers PhaseClosedError instead of retrying. The last try is the upsert again: a
 * planner may resolve the winning comment between the lost insert and the change, which frees
 * the slot for a new row.
 */
export async function upsertCommentStatements(
  db: DrizzleDb,
  statement: CommentStatement,
): Promise<UpsertedComment> {
  const attempts = [upsertStatement, changeStatement, upsertStatement];
  for (const attempt of attempts) {
    const found = await firstRow(db, attempt(statement), statement.input);
    if (found !== undefined) return upserted(found);
    await refuseIfClosed(db, statement);
  }
  throw new Error(`comment by ${statement.input.authorId} on ${statement.input.designId} vanished`);
}

/**
 * Replaces the text while the comment's project is open, in one statement that share-locks the
 * project row as the upsert does. Undefined when no comment has the id.
 */
export async function editCommentStatement(
  db: DrizzleDb,
  { input, now }: { readonly input: CommentEdit; readonly now: Date },
): Promise<ElementComment | undefined> {
  const design = sql`select design_id from element_comments where id = ${input.commentId}`;
  const [found] = resultRows(await db.execute(design));
  if (found === undefined) return undefined;
  const designId = z.object({ design_id: z.string() }).parse(found).design_id;
  const at = sql`${now.toISOString()}::timestamptz`;
  const [row] = resultRows(
    await db.execute(sql`
      with open_project as (${openProject({ designId }, now)})
      update element_comments set text = ${input.text}, updated_at = ${at}
      from open_project where element_comments.id = ${input.commentId}
      returning element_comments.*`),
  );
  if (row === undefined) throw new PhaseClosedError(`design ${designId}`);
  return commentOf(rawRowSchema.parse(row).row);
}
