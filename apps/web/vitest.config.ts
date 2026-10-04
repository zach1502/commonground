import { mergeConfig } from 'vitest/config';

import { definePackageConfig } from '../../vitest.shared.config.ts';

import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  definePackageConfig({
    environment: 'jsdom',
    // Each file still gets its own jsdom and module graph; threads start faster than processes,
    // and these tests read process.cwd() at most.
    pool: 'threads',
    setupFiles: ['./src/test-setup.ts'],
    coverageExclude: [
      'src/main.tsx',
      'src/test-setup.ts',
      'src/test/**',
      'src/design/viewer-panel.tsx',
      'src/pages/design-page.tsx',
    ],
  }),
);
