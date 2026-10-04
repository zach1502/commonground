import { setImmediate as nextTurn } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { PGlite, type Results, type Transaction } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from './schema/index.js';

/** Any Drizzle Postgres database or transaction over this package's schema. */
export type DrizzleDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface OpenDatabase {
  readonly db: DrizzleDb;
  /** Applies the migrations in drizzle/ that this database has not run yet. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

// src/adapters/drizzle and dist/adapters/drizzle sit at the same depth under packages/db.
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const PGLITE_SCHEME = 'pglite://';
const IN_MEMORY_PGLITE = 'memory';

/** Where a pglite:// URL keeps its files; undefined means in memory only. */
export function pgliteDataDir(url: string): string | undefined {
  const rest = url.slice(PGLITE_SCHEME.length);
  return rest === IN_MEMORY_PGLITE ? undefined : rest;
}

/**
 * pglite runs in this thread and hands queued work from one query to the next as promise
 * callbacks, so a backlog kept the event loop from accepting connections or running timers
 * until all of it was done. Under 500 parallel votes, new connections timed out after 8 s.
 * This client queues its own work and yields one event-loop turn before each query and
 * transaction; pglite still runs them one at a time.
 */
class TurnTakingPGlite extends PGlite {
  #turn: Promise<unknown> = Promise.resolve();

  override query<T>(...args: Parameters<PGlite['query']>): Promise<Results<T>> {
    return this.#inTurn(() => super.query<T>(...args));
  }

  override transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.#inTurn(() => super.transaction(callback));
  }

  #inTurn<T>(work: () => Promise<T>): Promise<T> {
    // Start-up runs its own queries through query(); queueing those behind a caller deadlocks.
    if (!this.ready) return work();
    const run = this.#turn.then(() => nextTurn()).then(work);
    this.#turn = run.catch(() => undefined);
    return run;
  }
}

/** Starts an embedded Postgres and wraps it in Drizzle, without applying the migrations. */
export function connectPglite(url: string): OpenDatabase {
  const dataDir = pgliteDataDir(url);
  const client = dataDir === undefined ? new TurnTakingPGlite() : new TurnTakingPGlite(dataDir);
  const db = drizzle(client, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

/** Applies the migrations, and closes the connection if they fail so no handle stays open. */
export async function migrateOrClose(connection: OpenDatabase): Promise<OpenDatabase> {
  try {
    await connection.migrate();
  } catch (error) {
    await connection.close();
    throw error;
  }
  return connection;
}

/** Starts an embedded Postgres, applies the migrations and wraps it in Drizzle. */
export function openPglite(url: string): Promise<OpenDatabase> {
  return migrateOrClose(connectPglite(url));
}
