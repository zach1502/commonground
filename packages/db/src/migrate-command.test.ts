import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrateCommand } from './migrate-command.js';
import { createTestDatabaseUrl, type TestDatabaseUrl } from './testing/test-database.js';

const START_TIMEOUT_MS = 60_000;

let target: TestDatabaseUrl | undefined;

beforeAll(async () => {
  target = await createTestDatabaseUrl();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await target?.drop();
});

function config() {
  if (target === undefined) throw new Error('the test database was not created');
  return { DATABASE_URL: target.url };
}

describe('runMigrateCommand', () => {
  it(
    'applies the migrations with no arguments and rolls one back with down',
    async () => {
      expect(await runMigrateCommand([], config())).toBe('Migrations are up to date.');
      expect(await runMigrateCommand(['down'], config())).toBe(
        'Rolled back 0006_element_comments.',
      );
      expect(await runMigrateCommand([], config())).toBe('Migrations are up to date.');
    },
    START_TIMEOUT_MS,
  );

  it('rejects an unknown command with the usage line', async () => {
    await expect(runMigrateCommand(['sideways'], config())).rejects.toThrow(
      'Usage: pnpm --filter @parkshape/db migrate [down]',
    );
  });
});
