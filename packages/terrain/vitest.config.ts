import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import { definePackageConfig } from '../../vitest.shared.config.ts';

// Tests under src/__live__ call the real services, so they never run here or in PR CI
// (AGENTS.md#tests). Run them with `pnpm --filter @parkshape/terrain test:live`.
export default mergeConfig(
  definePackageConfig({
    // The CLI entry files only wire process.argv and console to the tested commands.
    coverageExclude: ['src/__live__/**', 'src/cli/fetch-site.ts', 'src/cli/fetch-terrain.ts'],
  }),
  defineConfig({ test: { exclude: [...configDefaults.exclude, 'src/__live__/**'] } }),
);
