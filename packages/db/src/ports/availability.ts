/** Why the database could not take a call: never reached yet, dropped, or too slow to answer. */
export type UnavailableReason = 'not-connected' | 'connection-lost' | 'timed-out';

/**
 * Thrown by a repository when the database cannot be reached; callers answer 503 and retry.
 * A `timed-out` call may still have committed, because the query keeps running after the gate
 * gives up on it: a retried submit can then answer "already submitted". The gate reruns a whole
 * method after a dropped connection, which is safe only while every guarded method is one
 * statement or one transaction. Keep it that way.
 */
export class DatabaseUnavailableError extends Error {
  readonly kind = 'database-unavailable';

  constructor(
    readonly reason: UnavailableReason,
    options: { readonly cause?: unknown } = {},
  ) {
    super(`The database is unavailable (${reason}).`, options);
    this.name = 'DatabaseUnavailableError';
  }
}

/** Whether the database answers now; the API's readiness route reports it. */
export type Readiness =
  { readonly kind: 'ready' } | { readonly kind: 'unavailable'; readonly reason: UnavailableReason };

/** Where the database reports connection retries; the API passes its Logger. */
export interface DatabaseLogger {
  warn(message: string): void;
}
