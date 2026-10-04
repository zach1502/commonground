import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import { definePackageConfig } from '../../vitest.shared.config.ts';

// Tests under src/__live__ call a real model endpoint, so they never run here or in PR CI
// (AGENTS.md#tests). Run them with `pnpm --filter @parkshape/ai test:live`.
export default mergeConfig(
  definePackageConfig({
    coverageExclude: ['src/__live__/**', 'src/ports/__contracts__/**'],
    // Plain node tests that leave process state alone, so they run in worker threads.
    pool: 'threads',
  }),
  defineConfig({ test: { exclude: [...configDefaults.exclude, 'src/__live__/**'] } }),
);
