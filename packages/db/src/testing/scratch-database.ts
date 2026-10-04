import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

import { POSTGRES_OPTIONS } from '../adapters/drizzle/postgres.js';

const SCRATCH_PREFIX = 'parkshape_test_';

/** An empty database on a Postgres server, and the handle that drops it. */
export interface ScratchDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

async function onServer(
  serverUrl: string,
  run: (client: postgres.Sql) => Promise<unknown>,
): Promise<void> {
  // One connection, and quiet notices such as "database does not exist, skipping".
  const client = postgres(serverUrl, { ...POSTGRES_OPTIONS, max: 1, onnotice: () => undefined });
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Creates a database with a unique name on the server in serverUrl. Each test file gets its
 * own, so files running in parallel never see each other's rows.
 */
export async function createScratchDatabase(serverUrl: string): Promise<ScratchDatabase> {
  const name = `${SCRATCH_PREFIX}${randomUUID().replaceAll('-', '')}`;
  await onServer(serverUrl, (client) => client`create database ${client(name)}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () =>
      onServer(serverUrl, (client) => client`drop database if exists ${client(name)} with (force)`),
  };
}
