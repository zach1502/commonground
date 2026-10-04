import { CORE_COVERAGE_THRESHOLD, definePackageConfig } from '../../vitest.shared.config.ts';

// The whole-layout solver tests run for up to 10 s each on a laptop, and Stryker's
// instrumented copy with 4 workers runs them several times slower, past the 5 s default.
const SOLVER_TEST_TIMEOUT_MS = 60_000;

// The CLI entries only wire node:fs, process and console to runValidate, runMetrics and runScoringDemo, which are tested directly.
export default definePackageConfig({
  // These tests leave process.env, the working directory and native addons alone, so they run in
  // worker threads, which start faster than child processes.
  pool: 'threads',
  threshold: CORE_COVERAGE_THRESHOLD,
  coverageExclude: ['src/validate-cli.ts', 'src/metrics-cli.ts', 'src/scoring-demo.ts'],
  testTimeoutMs: SOLVER_TEST_TIMEOUT_MS,
});
