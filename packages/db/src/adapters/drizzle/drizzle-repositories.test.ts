import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { designRepositoryContract } from '../../ports/__contracts__/design-repository.contract.js';
import { elementCommentRepositoryContract } from '../../ports/__contracts__/element-comment-repository.contract.js';
import type { RepositoriesFactory } from '../../ports/__contracts__/fixtures.js';
import { guardedWritesContract } from '../../ports/__contracts__/guarded-writes.contract.js';
import { orderingAndReferencesContract } from '../../ports/__contracts__/ordering-and-references.contract.js';
import { projectRepositoryContract } from '../../ports/__contracts__/project-repository.contract.js';
import { userRepositoryContract } from '../../ports/__contracts__/user-repository.contract.js';
import { voteRepositoryContract } from '../../ports/__contracts__/vote-repository.contract.js';
import { openTestDatabase } from '../../testing/test-database.js';

import { DatabaseGate } from './availability.js';
import { assembleDatabase } from './connect.js';
import { resultRows } from './migrations.js';
import { MIGRATIONS_FOLDER, pgliteDataDir, type OpenDatabase } from './pglite.js';

import {
  DrizzleDesignRepository,
  DrizzleElementCommentRepository,
  DrizzleProjectRepository,
  DrizzleUserRepository,
  DrizzleVoteRepository,
  createDatabase,
  createDrizzleRepositories,
} from './index.js';

// pglite creates a whole cluster on disk the first time, which takes several seconds.
const DISK_TEST_TIMEOUT_MS = 30_000;
// Starting pglite and running the migrations takes about a second alone, but well over the
// 10 s hook default when every package's tests run at once. Only this hook gets the longer
// limit; each test keeps its own.
const PGLITE_START_TIMEOUT_MS = 60_000;

// One database per test file, pglite or a scratch one on PARKSHAPE_TEST_DATABASE_URL; each
// test starts from empty tables.
let connection: OpenDatabase | undefined;

beforeAll(async () => {
  connection = await openTestDatabase();
}, PGLITE_START_TIMEOUT_MS);

afterAll(async () => {
  await connection?.close();
});

async function freshDb() {
  if (connection === undefined) {
    throw new Error('the test database did not start');
  }
  await connection.db.execute(sql`truncate element_comments, votes, designs, projects, users`);
  return connection.db;
}

const explicit: RepositoriesFactory = async (deps) => {
  const db = await freshDb();
  return {
    users: new DrizzleUserRepository(db, deps),
    projects: new DrizzleProjectRepository(db, deps),
    designs: new DrizzleDesignRepository(db, deps),
    votes: new DrizzleVoteRepository(db, deps),
    elementComments: new DrizzleElementCommentRepository(db, deps),
  };
};

userRepositoryContract('DrizzleUserRepository', explicit);
projectRepositoryContract('DrizzleProjectRepository', explicit);
designRepositoryContract('DrizzleDesignRepository', explicit);
voteRepositoryContract('DrizzleVoteRepository', explicit);
guardedWritesContract('Drizzle repositories', explicit);
orderingAndReferencesContract('Drizzle repositories', explicit);
voteRepositoryContract('createDrizzleRepositories', async (deps) =>
  createDrizzleRepositories(await freshDb(), deps),
);
elementCommentRepositoryContract('DrizzleElementCommentRepository', explicit);

/** The repositories the API gets: every call runs through an open DatabaseGate with a timeout. */
const GUARD_TIMEOUT_MS = 5000;
const guarded: RepositoriesFactory = async (deps) => {
  const db = await freshDb();
  const gate = new DatabaseGate({ timeoutMs: GUARD_TIMEOUT_MS });
  gate.open();
  const unused = () => Promise.resolve();
  return assembleDatabase({ db, migrate: unused, close: unused }, deps, gate);
};
userRepositoryContract('DatabaseGate over DrizzleUserRepository', guarded);
projectRepositoryContract('DatabaseGate over DrizzleProjectRepository', guarded);
designRepositoryContract('DatabaseGate over DrizzleDesignRepository', guarded);
voteRepositoryContract('DatabaseGate over DrizzleVoteRepository', guarded);
guardedWritesContract('DatabaseGate over Drizzle repositories', guarded);
elementCommentRepositoryContract('DatabaseGate over DrizzleElementCommentRepository', guarded);

const deps = { clock: new FakeClock(new Date('2026-09-01T00:00:00Z')), newId: () => 'fixed-id' };

describe('createDatabase', () => {
  it('opens an in-memory pglite database with migrations applied', async () => {
    const database = await createDatabase({ DATABASE_URL: 'pglite://memory' }, deps);
    expect(await database.projects.list()).toEqual([]);
    await database.close();
  });

  it(
    'keeps data in a pglite directory across restarts',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'parkshape-db-'));
      const url = `pglite://${dir}`;
      const first = await createDatabase({ DATABASE_URL: url }, deps);
      await first.users.upsert({ id: 'kept', role: 'staff', displayName: 'Kept' });
      await first.close();
      const second = await createDatabase({ DATABASE_URL: url }, deps);
      expect((await second.users.findById('kept'))?.displayName).toBe('Kept');
      await second.close();
      await rm(dir, { recursive: true, force: true });
    },
    DISK_TEST_TIMEOUT_MS,
  );

  it('reads the data directory from the URL', () => {
    expect(pgliteDataDir('pglite://memory')).toBeUndefined();
    expect(pgliteDataDir('pglite://.data/parkshape')).toBe('.data/parkshape');
  });
});

/** Thrown to roll back a transaction once its checks have run. */
class RolledBack extends Error {}

type Executor = Pick<Awaited<ReturnType<typeof freshDb>>, 'execute'>;

async function publicColumns(tx: Executor): Promise<string[]> {
  const result: unknown = await tx.execute(
    sql`select column_name from information_schema.columns where table_name = 'projects'`,
  );
  return resultRows(result).map((row) => String(row.column_name));
}

describe('closes_at migration', () => {
  it('adds a nullable date column and its down file drops it again', async () => {
    const db = await freshDb();
    expect(await publicColumns(db)).toContain('closes_at');
    const down = await readFile(
      join(MIGRATIONS_FOLDER, 'down', '0001_project_closes_at.sql'),
      'utf8',
    );
    const statement = down.replace(/--[^\n]*/g, '').trim();
    const left = await db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(statement));
        throw Object.assign(new RolledBack('checked'), { left: await publicColumns(tx) });
      })
      .catch((error: unknown) => {
        if (error instanceof RolledBack && 'left' in error) return error.left;
        throw error;
      });
    expect(left).not.toContain('closes_at');
    expect(left).toContain('status');
    expect(await publicColumns(db)).toContain('closes_at');
  });
});

describe('down migration', () => {
  it('drops every table once the later down files run before the init one', async () => {
    const files = ['0006_element_comments.sql', '0002_rate_limit_buckets.sql', '0000_init.sql'];
    const downs = await Promise.all(
      files.map((file) => readFile(join(MIGRATIONS_FOLDER, 'down', file), 'utf8')),
    );
    const statements = downs
      .join('\n')
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '');
    // Postgres DDL is transactional, so the shared database gets its tables back afterwards.
    const tables = await (
      await freshDb()
    )
      .transaction(async (tx) => {
        for (const statement of statements) {
          await tx.execute(sql.raw(statement));
        }
        const left = await tx.execute(
          sql`select table_name from information_schema.tables where table_schema = 'public'`,
        );
        throw Object.assign(new RolledBack('checked'), { left });
      })
      .catch((error: unknown) => {
        if (error instanceof RolledBack && 'left' in error) return error.left;
        throw error;
      });
    expect(resultRows(tables)).toEqual([]);
    // freshDb truncates every table, so it fails if the rollback left any dropped.
    await expect(freshDb()).resolves.toBeDefined();
  });
});
