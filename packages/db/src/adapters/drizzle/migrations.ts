import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { MIGRATIONS_FOLDER, type DrizzleDb } from './pglite.js';
import { sqlStatements } from './sql-statements.js';

const JOURNAL_FILE = join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
const DOWN_FOLDER = join(MIGRATIONS_FOLDER, 'down');

const journalSchema = z.object({
  entries: z.array(z.object({ tag: z.string(), when: z.number() })),
});

export type JournalEntry = z.output<typeof journalSchema>['entries'][number];

const rowSchema = z.record(z.string(), z.unknown());
// pglite returns { rows }, postgres-js returns the rows as an array.
const resultSchema = z.union([
  z.array(rowSchema),
  z.object({ rows: z.array(rowSchema) }).transform((result) => result.rows),
]);

export type RollbackResult =
  | { readonly kind: 'rolled-back'; readonly tag: string }
  | { readonly kind: 'nothing-applied' }
  | { readonly kind: 'unknown-migration'; readonly appliedAt: number };

/** The rows of a raw `execute` result, whichever driver ran it. */
export function resultRows(result: unknown): Record<string, unknown>[] {
  return resultSchema.parse(result);
}

/** The migrations drizzle-kit wrote, oldest first. */
export async function journalEntries(): Promise<JournalEntry[]> {
  return journalSchema.parse(JSON.parse(await readFile(JOURNAL_FILE, 'utf8'))).entries;
}

/** The hand-written SQL that reverses the migration with this tag. */
export function downFile(tag: string): string {
  return join(DOWN_FOLDER, `${tag}.sql`);
}

/** Runs each statement of a SQL file in order, on the database or inside a transaction. */
export async function runSqlFile(db: Pick<DrizzleDb, 'execute'>, text: string): Promise<void> {
  for (const statement of sqlStatements(text)) {
    await db.execute(sql.raw(statement));
  }
}

/** The Drizzle migrator stores each applied migration's journal `when` as created_at. */
async function lastAppliedAt(db: DrizzleDb): Promise<number | undefined> {
  const [table] = resultRows(
    await db.execute(sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`),
  );
  if (table?.name === null || table?.name === undefined) return undefined;
  const [last] = resultRows(
    await db.execute(sql`select created_at::text as applied_at from drizzle.__drizzle_migrations
      order by created_at desc limit 1`),
  );
  return last === undefined ? undefined : Number(last.applied_at);
}

/**
 * Runs the down file of the newest applied migration and removes its row from the Drizzle
 * journal table in one transaction, so the next migrate applies it again.
 */
export async function rollBackLastMigration(db: DrizzleDb): Promise<RollbackResult> {
  const appliedAt = await lastAppliedAt(db);
  if (appliedAt === undefined) return { kind: 'nothing-applied' };
  const entry = (await journalEntries()).find((candidate) => candidate.when === appliedAt);
  if (entry === undefined) return { kind: 'unknown-migration', appliedAt };
  const down = await readFile(downFile(entry.tag), 'utf8');
  await db.transaction(async (tx) => {
    await runSqlFile(tx, down);
    await tx.execute(
      sql`delete from drizzle.__drizzle_migrations where created_at = ${appliedAt}::bigint`,
    );
  });
  return { kind: 'rolled-back', tag: entry.tag };
}
