import { access } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestDatabaseUrl,
  openTestDatabase,
  type TestDatabaseUrl,
} from '../../testing/test-database.js';

import {
  downFile,
  journalEntries,
  resultRows,
  rollBackLastMigration,
  runSqlFile,
} from './migrations.js';
import type { OpenDatabase } from './pglite.js';

import { connectDatabase, migrateDatabase, rollBackDatabase } from './index.js';

// Starting a database and applying the migrations can pass the 10 s hook default under load.
const START_TIMEOUT_MS = 60_000;
const APP_TABLES = [
  'designs',
  'element_comments',
  'projects',
  'rate_limit_buckets',
  'users',
  'votes',
];
const LAST_TAG = '0006_element_comments';
const TAGS_NEWEST_FIRST = [
  LAST_TAG,
  '0005_vote_comment',
  '0004_project_author',
  '0003_design_updated_at',
  '0002_rate_limit_buckets',
  '0001_project_closes_at',
  '0000_init',
];

// A down file with a semicolon in a string, in comments and in two dollar-quoted bodies.
const TRICKY_DOWN = `-- a comment; with a semicolon
create table tricky (note text);
insert into tricky values (';'), ('it''s; fine'), ('-- not a comment');
/* block; comment */
create function tricky_note() returns text language plpgsql as $$
begin
  return 'a;b';
end;
$$;
create function tricky_tag() returns text language sql as $body$ select ';'::text $body$;
`;
const TRICKY_CLEANUP =
  'drop function tricky_tag(); drop function tricky_note(); drop table tricky;';

const PUBLIC_TABLES = sql`select table_name from information_schema.tables
  where table_schema = 'public' order by table_name`;
const APPLIED_COUNT = sql`select count(*)::int as applied from drizzle.__drizzle_migrations`;
const VOTE_COLUMNS = sql`select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'votes'`;

async function publicTables(connection: OpenDatabase): Promise<unknown[]> {
  return resultRows(await connection.db.execute(PUBLIC_TABLES)).map((row) => row.table_name);
}

async function voteColumns(connection: OpenDatabase): Promise<unknown[]> {
  return resultRows(await connection.db.execute(VOTE_COLUMNS)).map((row) => row.column_name);
}

describe('the migration files', () => {
  it('have a down file for every migration in the journal', async () => {
    const entries = await journalEntries();
    expect(entries.map((entry) => entry.tag)).toContain(LAST_TAG);
    await Promise.all(
      entries.map((entry) => expect(access(downFile(entry.tag))).resolves.toBe(undefined)),
    );
  });
});

describe('rollBackLastMigration', () => {
  let connection: OpenDatabase | undefined;

  beforeAll(async () => {
    connection = await openTestDatabase();
  }, START_TIMEOUT_MS);

  afterAll(async () => {
    await connection?.close();
  });

  function opened(): OpenDatabase {
    if (connection === undefined) throw new Error('the test database did not start');
    return connection;
  }

  it('rolls the last migration back and applies it again', async () => {
    const db = opened();
    expect(await rollBackLastMigration(db.db)).toEqual({ kind: 'rolled-back', tag: LAST_TAG });
    expect(await publicTables(db)).not.toContain('element_comments');
    expect(await voteColumns(db)).toContain('comment');
    await db.migrate();
    expect(await publicTables(db)).toEqual(APP_TABLES);
  });

  it('runs a down file with semicolons in strings, comments and dollar-quoted bodies', async () => {
    const { db } = opened();
    await db.transaction((tx) => runSqlFile(tx, TRICKY_DOWN));
    const notes = await db.execute(sql`select note from tricky order by note`);
    expect(resultRows(notes).map((row) => row.note)).toEqual([
      '-- not a comment',
      ';',
      "it's; fine",
    ]);
    const bodies = await db.execute(sql`select tricky_note() as note, tricky_tag() as tag`);
    expect(resultRows(bodies)).toEqual([{ note: 'a;b', tag: ';' }]);
    await runSqlFile(db, TRICKY_CLEANUP);
  });

  it('rolls every migration back, then applies them all again', async () => {
    const db = opened();
    const tags: string[] = [];
    let result = await rollBackLastMigration(db.db);
    while (result.kind === 'rolled-back') {
      tags.push(result.tag);
      result = await rollBackLastMigration(db.db);
    }
    expect(result).toEqual({ kind: 'nothing-applied' });
    expect(tags).toEqual(TAGS_NEWEST_FIRST);
    expect(await publicTables(db)).toEqual([]);
    await db.migrate();
    expect(await publicTables(db)).toEqual(APP_TABLES);
  });
});

describe('migrateDatabase', () => {
  let target: TestDatabaseUrl | undefined;

  beforeAll(async () => {
    target = await createTestDatabaseUrl();
  }, START_TIMEOUT_MS);

  afterAll(async () => {
    await target?.drop();
  });

  it(
    'applies each migration once however often it runs, and rolls back through the URL',
    async () => {
      if (target === undefined) throw new Error('the test database was not created');
      const config = { DATABASE_URL: target.url };
      await migrateDatabase(config);
      await migrateDatabase(config);
      expect(await rollBackDatabase(config)).toEqual({ kind: 'rolled-back', tag: LAST_TAG });
      expect(await rollBackDatabase(config)).toEqual({
        kind: 'rolled-back',
        tag: TAGS_NEWEST_FIRST[1],
      });
      await migrateDatabase(config);
      const reopened = await connectDatabase(target.url);
      expect(resultRows(await reopened.db.execute(APPLIED_COUNT))).toEqual([
        { applied: TAGS_NEWEST_FIRST.length },
      ]);
      expect(await publicTables(reopened)).toEqual(APP_TABLES);
      await reopened.close();
    },
    START_TIMEOUT_MS,
  );
});
