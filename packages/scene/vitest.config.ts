import { definePackageConfig } from '../../vitest.shared.config.ts';

// Geometry tests run in node; the DOM overlay tests opt into jsdom per file. The R3F
// components under src/components and src/editor-components/canvas need WebGL, so the
// Playwright tests in e2e/ and apps/web/e2e cover them.
export default definePackageConfig({
  // These tests leave process.env, the working directory and native addons alone, so they run in
  // worker threads, which start faster than child processes.
  pool: 'threads',
  include: ['src/**/*.test.{ts,tsx}'],
  coverageExclude: [
    'src/components/**',
    'src/editor-components/canvas/**',
    'src/metrics-worker/worker.ts',
    'src/metrics-worker/default-worker.ts',
    'src/metrics-worker/metrics-fixtures.ts',
    'src/thumbnail/render-thumbnail.ts',
    'src/thumbnail-entry.ts',
    'src/viewer-entry.ts',
    'src/plan-entry.ts',
    'src/index.ts',
    'src/editor-entry.ts',
    'src/types.ts',
    'src/overlay/strings.ts',
    'src/editor/store/types.ts',
    'src/editor/test-fixtures.ts',
    'src/editor/actions/test-context.ts',
    'src/editor-components/test-strings.ts',
  ],
});
