import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { API_PORT, API_URL, WEB_PORT, WEB_URL } from './e2e/urls.ts';

const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('.data/e2e', import.meta.url));
const SEED_SUMMARY = fileURLToPath(new URL('test-results/seed-summary.json', import.meta.url));
// Seeding solves 30 layouts and draws 30 thumbnails in headless Chromium before the API listens.
const SEEDED_API_TIMEOUT_MS = 600_000;
const WEB_BUILD_TIMEOUT_MS = 240_000;
// Software WebGL, so the editor and viewer draw the same on every machine.
const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const CHROME = { ...devices['Desktop Chrome'], deviceScaleFactor: 1 };

// The golden paths run against the production build and the API on a freshly seeded pglite file.
// The API process seeds itself before it listens: the blob store is in memory, so the heightmap
// and thumbnails must be written by the process that serves them.
export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts$/,
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: { baseURL: WEB_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'desktop',
      testMatch: /planner\.spec\.ts/,
      use: {
        ...CHROME,
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: SWIFTSHADER },
      },
    },
    {
      name: 'mobile',
      testMatch: /resident\.spec\.ts/,
      // The planner checks the seeded totals, so it runs before a resident adds votes.
      dependencies: ['desktop'],
      use: {
        ...CHROME,
        viewport: { width: 360, height: 740 },
        launchOptions: { args: SWIFTSHADER },
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @parkshape/seed-tool run serve --summary ${SEED_SUMMARY}`,
      cwd: REPO_ROOT,
      url: `${API_URL}/health`,
      env: {
        DATABASE_URL: `pglite://${DATA_DIR}`,
        PORT: String(API_PORT),
        CORS_ORIGIN: WEB_URL,
        VITE_API_URL: API_URL,
        TERRAIN_PROVIDER: 'static',
        SITE_FEATURES_PROVIDER: 'static',
        AI_PROVIDER: 'rule-based',
        FEATURE_SUMMARY: 'true',
        FEATURE_DESCRIBE_IT: 'true',
        PARKSHAPE_OFFLINE: '1',
        // The golden paths cast more votes in a minute than the production limit allows.
        RATE_LIMIT_VOTES_PER_MINUTE: '120',
        RATE_LIMIT_LOGINS_PER_MINUTE: '600',
      },
      reuseExistingServer: false,
      timeout: SEEDED_API_TIMEOUT_MS,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    },
    {
      command: `pnpm run build && pnpm exec vite preview --port ${String(WEB_PORT)} --strictPort`,
      cwd: fileURLToPath(new URL('apps/web', import.meta.url)),
      url: WEB_URL,
      env: {
        VITE_API_URL: API_URL,
        VITE_EDITOR_TEST_HOOK: 'on',
        VITE_MAP_TILES: 'static',
        VITE_FEATURE_TERRAFORM: 'true',
        VITE_FEATURE_DESCRIBE_IT: 'true',
      },
      reuseExistingServer: false,
      timeout: WEB_BUILD_TIMEOUT_MS,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    },
  ],
});
