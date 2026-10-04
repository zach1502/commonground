import { sql } from 'drizzle-orm';

import type { Readiness } from '../../ports/availability.js';
import type { RateLimitStore } from '../../ports/rate-limit-store.js';
import type { RepositoryDeps } from '../../ports/records.js';
import type { Repositories } from '../../ports/repositories.js';
import { PostgresRateLimitStore } from '../rate-limit/postgres-rate-limit-store.js';

import { guardMethods, type DatabaseGate } from './availability.js';
import { DrizzleDesignRepository } from './design-repository.js';
import { DrizzleElementCommentRepository } from './element-comment-repository.js';
import { connectPglite, type DrizzleDb, type OpenDatabase } from './pglite.js';
import { DrizzleProjectRepository, DrizzleUserRepository } from './user-project-repositories.js';
import { DrizzleVoteRepository } from './vote-repository.js';

/** Repositories, the shared rate-limit buckets, and the handle that shuts the connection down. */
export interface Database extends Repositories {
  readonly rateLimitStore: RateLimitStore;
  /** Runs `select 1` within the query timeout; the API's /ready route reports the answer. */
  readiness(): Promise<Readiness>;
  close(): Promise<void>;
}

/** Every repository over one Drizzle connection. */
export function createDrizzleRepositories(db: DrizzleDb, deps: RepositoryDeps): Repositories {
  return {
    users: new DrizzleUserRepository(db, deps),
    projects: new DrizzleProjectRepository(db, deps),
    designs: new DrizzleDesignRepository(db, deps),
    votes: new DrizzleVoteRepository(db, deps),
    elementComments: new DrizzleElementCommentRepository(db, deps),
  };
}

/**
 * Connects to the database named by a DATABASE_URL without applying migrations:
 * pglite://memory or pglite://<dir> for embedded Postgres, postgres:// for a server.
 */
export async function connectDatabase(url: string): Promise<OpenDatabase> {
  if (url.startsWith('pglite://')) {
    return connectPglite(url);
  }
  // Loaded on demand so local runs never touch the network driver.
  const { connectPostgres } = await import('./postgres.js');
  return connectPostgres(url);
}

/** The repositories and buckets over one connection, each call run through the gate. */
export function assembleDatabase(
  connection: OpenDatabase,
  deps: RepositoryDeps,
  gate: DatabaseGate,
): Database {
  const repos = createDrizzleRepositories(connection.db, deps);
  return {
    users: guardMethods(repos.users, gate),
    projects: guardMethods(repos.projects, gate),
    designs: guardMethods(repos.designs, gate),
    votes: guardMethods(repos.votes, gate),
    elementComments: guardMethods(repos.elementComments, gate),
    rateLimitStore: guardMethods(new PostgresRateLimitStore(connection.db), gate),
    readiness: () => gate.readiness(() => connection.db.execute(sql`select 1`)),
    close: () => {
      gate.close();
      return connection.close();
    },
  };
}
