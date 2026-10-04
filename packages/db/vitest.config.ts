import { definePackageConfig } from '../../vitest.shared.config.ts';

// Most tests here open pglite and run the migrations, which takes seconds when every package's
// tests run at once.
const PGLITE_TEST_TIMEOUT_MS = 60_000;

// migrate-cli.ts only reads the process config and prints; migrate-command.ts holds the logic.
export default definePackageConfig({
  coverageExclude: ['src/migrate-cli.ts'],
  testTimeoutMs: PGLITE_TEST_TIMEOUT_MS,
});
