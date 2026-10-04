import type { AppConfig } from '@parkshape/config';

import { migrateDatabase, rollBackDatabase } from './adapters/drizzle/index.js';
import type { RollbackResult } from './adapters/drizzle/migrations.js';

const USAGE = 'Usage: pnpm --filter @parkshape/db migrate [down]';

function rollbackMessage(result: RollbackResult): string {
  switch (result.kind) {
    case 'rolled-back':
      return `Rolled back ${result.tag}.`;
    case 'nothing-applied':
      return 'No migration is applied, so there is nothing to roll back.';
    case 'unknown-migration':
      return `The newest applied migration (${String(result.appliedAt)}) is not in the journal.`;
  }
}

/**
 * `migrate` applies the pending migrations at DATABASE_URL, as the API does when it starts.
 * `migrate down` rolls back the newest one with its file in drizzle/down.
 */
export async function runMigrateCommand(
  args: readonly string[],
  config: Pick<AppConfig, 'DATABASE_URL'>,
): Promise<string> {
  const [command, ...rest] = args;
  if (rest.length > 0 || (command !== undefined && command !== 'down')) {
    throw new Error(USAGE);
  }
  if (command === 'down') {
    return rollbackMessage(await rollBackDatabase(config));
  }
  await migrateDatabase(config);
  return 'Migrations are up to date.';
}
