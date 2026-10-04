import type { AppConfig } from '@parkshape/config';

import type { RepositoryDeps } from '../../ports/records.js';

import { DatabaseGate } from './availability.js';
import { assembleDatabase, connectDatabase, type Database } from './connect.js';
import { DrizzleDesignRepository } from './design-repository.js';
import { DrizzleElementCommentRepository } from './element-comment-repository.js';
import { rollBackLastMigration, type RollbackResult } from './migrations.js';
import { migrateOrClose, type OpenDatabase } from './pglite.js';
import { queryTimeoutFor } from './start.js';
import { DrizzleProjectRepository, DrizzleUserRepository } from './user-project-repositories.js';
import { DrizzleVoteRepository } from './vote-repository.js';

export {
  DrizzleDesignRepository,
  DrizzleElementCommentRepository,
  DrizzleProjectRepository,
  DrizzleUserRepository,
  DrizzleVoteRepository,
};
export { connectDatabase, createDrizzleRepositories, type Database } from './connect.js';

async function withConnection<T>(
  config: Pick<AppConfig, 'DATABASE_URL'>,
  run: (connection: OpenDatabase) => Promise<T>,
): Promise<T> {
  const connection = await connectDatabase(config.DATABASE_URL);
  try {
    return await run(connection);
  } finally {
    await connection.close();
  }
}

/** Applies the pending migrations, the same step createDatabase runs when the API starts. */
export function migrateDatabase(config: Pick<AppConfig, 'DATABASE_URL'>): Promise<void> {
  return withConnection(config, (connection) => connection.migrate());
}

/** Rolls back the newest applied migration with its file in drizzle/down. */
export function rollBackDatabase(config: Pick<AppConfig, 'DATABASE_URL'>): Promise<RollbackResult> {
  return withConnection(config, (connection) => rollBackLastMigration(connection.db));
}

/** Opens the database named by DATABASE_URL and applies migrations; throws if it cannot. */
export async function createDatabase(
  config: Pick<AppConfig, 'DATABASE_URL'>,
  deps: RepositoryDeps,
): Promise<Database> {
  const connection = await migrateOrClose(await connectDatabase(config.DATABASE_URL));
  const gate = new DatabaseGate(queryTimeoutFor(config));
  gate.open();
  return assembleDatabase(connection, deps, gate);
}
