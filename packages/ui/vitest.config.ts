import { definePackageConfig } from '../../vitest.shared.config.ts';

// Each file still gets its own jsdom and module graph; threads start faster than processes.
export default definePackageConfig({
  environment: 'jsdom',
  pool: 'threads',
  setupFiles: ['./src/test-setup.ts'],
});
