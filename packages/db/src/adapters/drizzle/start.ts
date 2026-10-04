import { setTimeout as sleep } from 'node:timers/promises';

import type { AppConfig } from '@parkshape/config';

import { DatabaseUnavailableError, type DatabaseLogger } from '../../ports/availability.js';
import type { RepositoryDeps } from '../../ports/records.js';

import { DatabaseGate, type DatabaseGateOptions } from './availability.js';
import { assembleDatabase, connectDatabase, type Database } from './connect.js';
import type { OpenDatabase } from './pglite.js';

/** How many times to try the first connection, and how long to wait between tries. */
export interface RetryPolicy {
  readonly attempts: number;
  readonly firstDelayMs: number;
  readonly maxDelayMs: number;
}

/** 8 tries over about 45 s: 0.5, 1, 2, 4, 8, then 10 s apart. */
export const DATABASE_RETRY: RetryPolicy = { attempts: 8, firstDelayMs: 500, maxDelayMs: 10_000 };

/**
 * A repository call on a Postgres server that has not answered after this long fails with 503.
 * postgres-js has no per-query timeout, and a server that stops answering would otherwise hold
 * the request until the OS gives up on the socket. pglite runs in this process and has none.
 */
export const DATABASE_QUERY_TIMEOUT_MS = 5000;

const DOUBLING = 2;

/** The wait before each retry: doubling from firstDelayMs, never above maxDelayMs. */
export function backoffDelays(policy: RetryPolicy): number[] {
  return Array.from({ length: Math.max(0, policy.attempts - 1) }, (_, index) =>
    Math.min(policy.maxDelayMs, policy.firstDelayMs * DOUBLING ** index),
  );
}

export function queryTimeoutFor(config: Pick<AppConfig, 'DATABASE_URL'>): DatabaseGateOptions {
  return config.DATABASE_URL.startsWith('pglite://')
    ? {}
    : { timeoutMs: DATABASE_QUERY_TIMEOUT_MS };
}

export type RetryWait = (ms: number, signal: AbortSignal) => Promise<void>;

export interface StartDatabaseOptions {
  readonly logger: DatabaseLogger;
  readonly retry?: RetryPolicy;
  /** Waits between tries; tests release it by hand. */
  readonly wait?: RetryWait;
  /** Opens the connection; defaults to the driver DATABASE_URL names. */
  readonly connect?: () => Promise<OpenDatabase>;
}

/** A database that may still be connecting; `ready` settles when it opens or gives up. */
export interface StartedDatabase extends Database {
  readonly ready: Promise<void>;
}

const defaultWait: RetryWait = (ms, signal) =>
  sleep(ms, undefined, { signal }).catch(() => undefined);

function failureCode(error: unknown): string {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return error instanceof Error ? error.message : 'unknown error';
}

async function migrated(connection: OpenDatabase): Promise<unknown> {
  try {
    await connection.migrate();
    return undefined;
  } catch (error) {
    return error ?? new Error('migration failed');
  }
}

interface RetryRun {
  readonly connection: OpenDatabase;
  readonly gate: DatabaseGate;
  readonly policy: RetryPolicy;
  readonly options: StartDatabaseOptions;
  readonly signal: AbortSignal;
}

/** Tries again after each delay until a migration lands, the tries run out, or close aborts. */
async function retryMigration(run: RetryRun, firstError: unknown): Promise<void> {
  const { policy, options, signal } = run;
  const wait = options.wait ?? defaultWait;
  let error = firstError;
  for (const [index, delayMs] of backoffDelays(policy).entries()) {
    const failedAttempt = index + 1;
    options.logger.warn(
      `database: attempt ${String(failedAttempt)} of ${String(policy.attempts)} failed ` +
        `(${failureCode(error)}); retrying in ${String(delayMs)} ms.`,
    );
    await wait(delayMs, signal);
    if (signal.aborted) throw new DatabaseUnavailableError('not-connected');
    error = await migrated(run.connection);
    if (error === undefined) {
      run.gate.open();
      options.logger.warn(`database: connected on attempt ${String(failedAttempt + 1)}.`);
      return;
    }
  }
  options.logger.warn(
    `database: gave up after ${String(policy.attempts)} attempts (${failureCode(error)}).`,
  );
  throw new DatabaseUnavailableError('not-connected', { cause: error });
}

/**
 * Opens the database without failing the boot: the first migration runs before this returns,
 * and if the server refuses, later tries run in the background with backoff while every
 * repository call answers DatabaseUnavailableError. The API stays up and /ready says 503.
 */
export async function startDatabase(
  config: Pick<AppConfig, 'DATABASE_URL'>,
  deps: RepositoryDeps,
  options: StartDatabaseOptions,
): Promise<StartedDatabase> {
  const connection = await (options.connect ?? (() => connectDatabase(config.DATABASE_URL)))();
  const gate = new DatabaseGate(queryTimeoutFor(config));
  const stop = new AbortController();
  const database = assembleDatabase(connection, deps, gate);
  const firstError = await migrated(connection);
  if (firstError === undefined) gate.open();
  const policy = options.retry ?? DATABASE_RETRY;
  const ready =
    firstError === undefined
      ? Promise.resolve()
      : retryMigration({ connection, gate, policy, options, signal: stop.signal }, firstError);
  // The entry decides what giving up means; nothing here leaves the rejection unhandled.
  ready.catch(() => undefined);
  return {
    ...database,
    ready,
    close: () => {
      stop.abort();
      return database.close();
    },
  };
}
