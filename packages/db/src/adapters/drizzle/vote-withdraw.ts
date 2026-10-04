import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { WithdrawnVote, WithdrawVote } from '../../ports/vote-repository.js';

import { resultRows } from './migrations.js';
import type { DrizzleDb } from './pglite.js';
import { openProject, refuseIfClosed } from './vote-upsert.js';

const countsRowSchema = z.object({ design_up: z.number(), design_down: z.number() });

/**
 * The vote's delete and its counters in one statement. The delete runs only while the project
 * is open, and takes the person's vote row, so a change racing it either lands first and is
 * deleted with its own value, or finds no row and inserts a fresh vote after it.
 */
function withdrawStatement(input: WithdrawVote, now: Date) {
  return sql`
    with open_project as (${openProject(input, now)}), removed as (
      delete from votes using open_project
      where votes.user_id = ${input.userId} and votes.design_id = ${input.designId}
      returning votes.value
    ), counted as (
      update designs set
        up = up - (case when removed.value = 1 then 1 else 0 end),
        down = down - (case when removed.value = -1 then 1 else 0 end)
      from removed where designs.id = ${input.designId}
      returning designs.up, designs.down
    )
    select counted.up as design_up, counted.down as design_down from counted`;
}

async function firstCounts(db: DrizzleDb, query: ReturnType<typeof sql>) {
  const [row] = resultRows(await db.execute(query));
  if (row === undefined) return undefined;
  const parsed = countsRowSchema.parse(row);
  return { up: parsed.design_up, down: parsed.design_down };
}

/**
 * Withdraws one vote in one statement. When it removed nothing, one read of the phase answers a
 * closed project or a missing design, and one more reads the counters the person left alone.
 */
export async function withdrawVoteStatements(
  db: DrizzleDb,
  input: WithdrawVote,
  now: Date,
): Promise<WithdrawnVote> {
  const withdrawn = await firstCounts(db, withdrawStatement(input, now));
  if (withdrawn !== undefined) return { outcome: 'withdrawn', counts: withdrawn };
  await refuseIfClosed(db, { input, now });
  const current = sql`
    select up as design_up, down as design_down from designs where id = ${input.designId}`;
  const counts = await firstCounts(db, current);
  if (counts === undefined) throw new Error(`design ${input.designId} vanished`);
  return { outcome: 'absent', counts };
}
