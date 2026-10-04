import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfigFromProcess } from '@parkshape/config';

import { openPglite, type OpenDatabase } from '../adapters/drizzle/pglite.js';
import { openPostgres } from '../adapters/drizzle/postgres.js';

import { createScratchDatabase } from './scratch-database.js';

// Empty runs the tests on pglite. A postgres:// URL runs the same tests on a real server.
const SERVER_URL = loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL;

export interface TestDatabaseUrl {
  readonly url: string;
  drop(): Promise<void>;
}

/** An empty database for one test file: a pglite directory, or a scratch database on the server. */
export async function createTestDatabaseUrl(): Promise<TestDatabaseUrl> {
  if (SERVER_URL !== '') return createScratchDatabase(SERVER_URL);
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-db-'));
  return { url: `pglite://${dir}`, drop: () => rm(dir, { recursive: true, force: true }) };
}

/** A migrated database for one test file: in-memory pglite, or a scratch database on the server. */
export async function openTestDatabase(): Promise<OpenDatabase> {
  if (SERVER_URL === '') return openPglite('pglite://memory');
  const scratch = await createScratchDatabase(SERVER_URL);
  const connection = await openPostgres(scratch.url);
  return {
    ...connection,
    close: async () => {
      await connection.close();
      await scratch.drop();
    },
  };
}
