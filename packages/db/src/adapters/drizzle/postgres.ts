import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { MIGRATIONS_FOLDER, migrateOrClose, type OpenDatabase } from './pglite.js';
import * as schema from './schema/index.js';

// A new connection that the server has not accepted in this many seconds fails, so a request
// that needs one answers 503 within the query timeout. postgres-js waits 30 s by default.
const CONNECT_TIMEOUT_SECONDS = 3;

// postgres-js waits (3^retries / 100) s, up to 20 s, before reconnecting, and the retry count
// only resets on a successful connect. After a short outage the pool then sat idle for up to
// 20 s with the server back. This doubles from 50 ms and stops at 1 s.
const RECONNECT_FIRST_SECONDS = 0.05;
const RECONNECT_MAX_SECONDS = 1;
const RECONNECT_GROWTH = 2;

function reconnectDelaySeconds(retries: number): number {
  return Math.min(RECONNECT_MAX_SECONDS, RECONNECT_FIRST_SECONDS * RECONNECT_GROWTH ** retries);
}

// client.end() waits for every connection to finish, and after an outage a connection that
// was mid-handshake never does. Past this many seconds, end() destroys what is left.
export const POSTGRES_CLOSE_TIMEOUT_SECONDS = 2;

/**
 * Supabase's transaction pooler (port 6543), which serverless functions use, cannot keep
 * prepared statements between transactions, so the driver must not create them. A dropped
 * connection is replaced on the next query, so the pool recovers when the server returns.
 */
export const POSTGRES_OPTIONS = {
  prepare: false,
  connect_timeout: CONNECT_TIMEOUT_SECONDS,
  backoff: reconnectDelaySeconds,
} as const;

/** Connects to a Postgres server (for example Supabase) without applying the migrations. */
export function connectPostgres(url: string): OpenDatabase {
  const client = postgres(url, POSTGRES_OPTIONS);
  const db = drizzle(client, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.end({ timeout: POSTGRES_CLOSE_TIMEOUT_SECONDS }),
  };
}

/**
 * Connects to a Postgres server and applies the migrations. A failed start closes the client,
 * so no socket keeps the process alive. The contract tests run here too when
 * PARKSHAPE_TEST_DATABASE_URL names a server, as it does in CI.
 */
export function openPostgres(url: string): Promise<OpenDatabase> {
  return migrateOrClose(connectPostgres(url));
}
