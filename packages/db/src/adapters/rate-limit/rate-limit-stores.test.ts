import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { rateLimitStoreContract } from '../../ports/__contracts__/rate-limit-store.contract.js';
import { openTestDatabase } from '../../testing/test-database.js';
import { createDatabase } from '../drizzle/index.js';
import { resultRows } from '../drizzle/migrations.js';
import { MIGRATIONS_FOLDER, type OpenDatabase } from '../drizzle/pglite.js';

import { InMemoryRateLimitStore } from './in-memory-rate-limit-store.js';
import { PostgresRateLimitStore } from './postgres-rate-limit-store.js';

// Starting the test database and applying the migrations can pass the 10 s hook default under load.
const PGLITE_START_TIMEOUT_MS = 60_000;

let connection: OpenDatabase | undefined;

beforeAll(async () => {
  connection = await openTestDatabase();
}, PGLITE_START_TIMEOUT_MS);

afterAll(async () => {
  await connection?.close();
});

async function freshPostgresStore(): Promise<PostgresRateLimitStore> {
  if (connection === undefined) {
    throw new Error('the test database did not start');
  }
  await connection.db.execute(sql`truncate rate_limit_buckets`);
  return new PostgresRateLimitStore(connection.db);
}

rateLimitStoreContract('InMemoryRateLimitStore', () =>
  Promise.resolve(new InMemoryRateLimitStore()),
);
rateLimitStoreContract('PostgresRateLimitStore', freshPostgresStore);

/** Thrown to roll back a transaction once its checks have run. */
class RolledBack extends Error {
  constructor(readonly tables: unknown) {
    super('checked');
  }
}

const TABLE_COLUMNS = sql`select column_name, data_type from information_schema.columns
  where table_name = 'rate_limit_buckets' order by ordinal_position`;

describe('rate_limit_buckets migration', () => {
  it('creates the bucket table and its down file drops it again', async () => {
    const db = connection?.db;
    if (db === undefined) throw new Error('the test database did not start');
    expect(resultRows(await db.execute(TABLE_COLUMNS))).toEqual([
      { column_name: 'key', data_type: 'text' },
      { column_name: 'tokens', data_type: 'double precision' },
      { column_name: 'updated_ms', data_type: 'bigint' },
    ]);
    const down = await readFile(join(MIGRATIONS_FOLDER, 'down', '0002_rate_limit_buckets.sql'));
    const left = await db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(down.toString('utf8').replace(/--[^\n]*/g, '')));
        throw new RolledBack(await tx.execute(TABLE_COLUMNS));
      })
      .catch((error: unknown) => {
        if (error instanceof RolledBack) return error.tables;
        throw error;
      });
    expect(resultRows(left)).toEqual([]);
  });
});

describe('createDatabase', () => {
  it(
    'hands out a Postgres rate-limit store over the same connection',
    async () => {
      const clock = new FakeClock(new Date('2026-09-01T00:00:00Z'));
      const database = await createDatabase(
        { DATABASE_URL: 'pglite://memory' },
        { clock, newId: () => 'fixed-id' },
      );
      expect(database.rateLimitStore).toBeInstanceOf(PostgresRateLimitStore);
      await database.close();
    },
    PGLITE_START_TIMEOUT_MS,
  );
});
