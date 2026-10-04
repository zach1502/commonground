import { connectDatabase } from '../adapters/drizzle/connect.js';
import type { OpenDatabase } from '../adapters/drizzle/pglite.js';

export interface RefusingConnectionOptions {
  /** The database to open once the refusals run out; pglite://memory by default. */
  readonly url?: string;
  /** How many migrations fail before one goes through. */
  readonly refusals: number;
}

/** What drizzle throws when the server refuses: its own error, with the socket error as cause. */
export function connectionRefused(): Error {
  const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
    code: 'ECONNREFUSED',
  });
  return new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"', { cause });
}

/**
 * A connect function for startDatabase whose first migrations fail as if the server refused
 * them, so tests can start the API while its database is down and then bring it back.
 */
export function refusingConnection(
  options: RefusingConnectionOptions,
): () => Promise<OpenDatabase> {
  let left = options.refusals;
  return async () => {
    const real = await connectDatabase(options.url ?? 'pglite://memory');
    return {
      ...real,
      migrate: () => {
        if (left <= 0) return real.migrate();
        left -= 1;
        return Promise.reject(connectionRefused());
      },
    };
  };
}
