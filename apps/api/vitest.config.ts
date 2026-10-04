import { definePackageConfig } from '../../vitest.shared.config.ts';

// Integration tests in test/ start an embedded Postgres per file, which takes a moment, and
// longer when every package's tests run at once.
const PGLITE_HOOK_TIMEOUT_MS = 30_000;
// A few tests open pglite or wait for a migration retry inside the test body.
const PGLITE_TEST_TIMEOUT_MS = 60_000;

export default definePackageConfig({
  hookTimeoutMs: PGLITE_HOOK_TIMEOUT_MS,
  testTimeoutMs: PGLITE_TEST_TIMEOUT_MS,
  include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  // The worker entry runs only inside a worker thread, where v8 coverage does not reach.
  coverageExclude: ['src/entry.*.ts', 'src/adapters/metrics-worker.ts'],
});
