import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { PARK_TIME_ZONE } from '@parkshape/core';

import { MissingReferenceError, PhaseClosedError } from '../../ports/repositories.js';
import type { CastVote, UpsertedVote } from '../../ports/vote-repository.js';

import { resultRows } from './migrations.js';
import type { DrizzleDb } from './pglite.js';

// Foreign key violation: the vote names a design or person that does not exist.
const FOREIGN_KEY_VIOLATION = '23503';

// Drivers return timestamps as text under drizzle, which maps them itself for typed queries.
const timestamp = z.union([z.date(), z.string()]).transform((value) => new Date(value));

const castRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  design_id: z.string(),
  value: z.union([z.literal(1), z.literal(-1)]),
  reasons: z.array(z.string()),
  comment: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  previous_value: z.union([z.literal(1), z.literal(-1), z.null()]),
  design_up: z.number(),
  design_down: z.number(),
});

type CastRow = z.infer<typeof castRowSchema>;

export interface VoteStatement {
  readonly input: CastVote;
  readonly id: string;
  readonly now: Date;
}

const upOf = (value: number) => (value === 1 ? 1 : 0);
const downOf = (value: number) => (value === -1 ? 1 : 0);

/** The vote's reasons as a text[] built from one JSON parameter. */
function reasonsArray(input: CastVote) {
  return sql`array(select jsonb_array_elements_text(${JSON.stringify(input.reasons)}::jsonb))`;
}

/** The comment as a text parameter; a vote cast without one has none. */
function commentOf(input: CastVote) {
  return sql`${input.comment ?? null}::text`;
}

/**
 * The design's project, share-locked for the rest of the statement, while it is open: staff have
 * not closed it and the park's calendar day on the injected clock is on or before closes_at, as
 * projectPhase decides. A close is an UPDATE of this row, so it waits for the vote or the vote
 * waits for it and then re-reads the committed row and finds it closed.
 */
export function openProject(input: Pick<CastVote, 'designId'>, now: Date) {
  const today = sql`(${now.toISOString()}::timestamptz at time zone ${PARK_TIME_ZONE})::date`;
  return sql`
    select projects.id from projects
    join designs on designs.project_id = projects.id
    where designs.id = ${input.designId} and projects.status = 'open'
      and (projects.closes_at is null or projects.closes_at >= ${today})
    for share of projects`;
}

/** How much the counters move: the new vote's side, less the side of the vote it replaced. */
function counterUpdate(input: CastVote, previousValue: ReturnType<typeof sql>) {
  const upBack = sql`(case when ${previousValue} = 1 then 1 else 0 end)`;
  const downBack = sql`(case when ${previousValue} = -1 then 1 else 0 end)`;
  return sql`up = up + ${upOf(input.value)} - ${upBack}, down = down + ${downOf(input.value)} - ${downBack}`;
}

/**
 * The vote and its counters in one statement. FOR UPDATE takes the person's vote row if there is
 * one and, under READ COMMITTED, reads its latest committed value; the vote is then changed, or
 * inserted when there was none, and the design's counters move by the difference. The unique
 * constraint still decides between two first votes at once: the later insert does nothing and
 * returns no row, and the caller runs changeStatement for it.
 */
function castStatement({ input, id, now }: VoteStatement) {
  const at = sql`${now.toISOString()}::timestamptz`;
  return sql`
    with open_project as (${openProject(input, now)}), previous as (
      select id, value from votes
      where user_id = ${input.userId} and design_id = ${input.designId}
      for update
    ), inserted as (
      insert into votes (id, user_id, design_id, value, reasons, comment, created_at, updated_at)
      select ${id}, ${input.userId}, ${input.designId}, ${input.value}, ${reasonsArray(input)},
        ${commentOf(input)}, ${at}, ${at}
      where not exists (select 1 from previous) and exists (select 1 from open_project)
      on conflict on constraint votes_user_design_unique do nothing
      returning *
    ), changed as (
      update votes set value = ${input.value}, reasons = ${reasonsArray(input)},
        comment = ${commentOf(input)}, updated_at = ${at}
      from previous, open_project where votes.id = previous.id
      returning votes.*, previous.value as previous_value
    ), cast_vote as (
      select inserted.*, null::integer as previous_value from inserted
      union all select * from changed
    ), counted as (
      update designs set ${counterUpdate(input, sql`cast_vote.previous_value`)}
      from cast_vote where designs.id = ${input.designId}
      returning designs.up, designs.down
    )
    select cast_vote.*, counted.up as design_up, counted.down as design_down
    from cast_vote, counted`;
}

/**
 * A changed vote and its counters, for the first vote that lost the race above: by now the
 * other vote has committed, so FOR UPDATE finds it. The design row is locked only by the counter
 * update, for the rest of this one statement.
 */
function changeStatement({ input, now }: VoteStatement) {
  const at = sql`${now.toISOString()}::timestamptz`;
  return sql`
    with open_project as (${openProject(input, now)}), previous as (
      select id, value from votes
      where user_id = ${input.userId} and design_id = ${input.designId}
      for update
    ), changed as (
      update votes set value = ${input.value}, reasons = ${reasonsArray(input)},
        comment = ${commentOf(input)}, updated_at = ${at}
      from previous, open_project where votes.id = previous.id
      returning votes.*, previous.value as previous_value
    ), counted as (
      update designs set ${counterUpdate(input, sql`changed.previous_value`)}
      from changed where designs.id = ${input.designId}
      returning designs.up, designs.down
    )
    select changed.*, counted.up as design_up, counted.down as design_down
    from changed, counted`;
}

function upserted(row: CastRow): UpsertedVote {
  const outcome = row.previous_value === null ? 'created' : 'updated';
  return {
    vote: {
      id: row.id,
      userId: row.user_id,
      designId: row.design_id,
      value: row.value,
      reasons: row.reasons,
      comment: row.comment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    outcome,
    counts: { up: row.design_up, down: row.design_down },
  };
}

function missingReference(error: unknown, input: CastVote): MissingReferenceError | undefined {
  // postgres-js names the constraint constraint_name, pglite names it constraint. The optional
  // branch goes last: zod drops unknown keys, so tried first it matched postgres-js errors with
  // no constraint, and a missing voter was reported as a missing design.
  const found = z
    .object({ code: z.string(), constraint_name: z.string() })
    .or(z.object({ code: z.string(), constraint: z.string().optional() }))
    .safeParse(error instanceof Error && 'cause' in error && error.cause ? error.cause : error);
  if (!found.success || found.data.code !== FOREIGN_KEY_VIOLATION) return undefined;
  const constraint =
    'constraint_name' in found.data ? found.data.constraint_name : found.data.constraint;
  return constraint?.includes('user') === true
    ? new MissingReferenceError(`user ${input.userId}`)
    : new MissingReferenceError(`design ${input.designId}`);
}

async function firstCastRow(db: DrizzleDb, query: ReturnType<typeof sql>, input: CastVote) {
  try {
    const [row] = resultRows(await db.execute(query));
    return row === undefined ? undefined : castRowSchema.parse(row);
  } catch (error) {
    throw missingReference(error, input) ?? error;
  }
}

/** Throws when a statement wrote nothing because the design is missing or its project closed. */
export async function refuseIfClosed(
  db: DrizzleDb,
  { input, now }: { readonly input: Pick<CastVote, 'designId'>; readonly now: Date },
): Promise<void> {
  if (resultRows(await db.execute(openProject(input, now))).length > 0) return;
  const design = sql`select 1 from designs where id = ${input.designId}`;
  if (resultRows(await db.execute(design)).length === 0) {
    throw new MissingReferenceError(`design ${input.designId}`);
  }
  throw new PhaseClosedError(`design ${input.designId}`);
}

/**
 * Casts or changes one vote in one statement, or more after a lost race or a close, with no
 * transaction. A statement that wrote nothing is followed by one read of the phase, so a closed
 * project answers PhaseClosedError instead of retrying.
 */
export async function upsertVoteStatements(
  db: DrizzleDb,
  statement: VoteStatement,
): Promise<UpsertedVote> {
  const cast = await firstCastRow(db, castStatement(statement), statement.input);
  if (cast !== undefined) return upserted(cast);
  await refuseIfClosed(db, statement);
  const changed = await firstCastRow(db, changeStatement(statement), statement.input);
  if (changed !== undefined) return upserted(changed);
  await refuseIfClosed(db, statement);
  throw new Error(`vote by ${statement.input.userId} on ${statement.input.designId} vanished`);
}
