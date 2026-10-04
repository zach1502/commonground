import { definePackageConfig } from '../../vitest.shared.config.ts';

// Plain node tests that leave process state alone, so they run in worker threads.
export default definePackageConfig({ pool: 'threads' });
