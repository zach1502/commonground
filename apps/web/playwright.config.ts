import { defineConfig, devices } from '@playwright/test';

import { API_URL, WEB_URL } from './e2e/urls.ts';

const WEB_PORT = 4173;
const API_PORT = 8787;

// The API runs on an in-memory pglite database, and vite preview serves the production build, so
// each run starts from an empty database. Chromium runs the smoke pages, voting and the editor
// bug checks.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: WEB_URL, ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
  projects: [
    { name: 'setup', testMatch: /project\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /project\.setup\.ts/,
      // Software WebGL, so the editor canvas renders the same on every machine.
      use: { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
    },
  ],
  webServer: [
    {
      command: 'node ../api/dist/entry.node.js',
      url: `${API_URL}/health`,
      env: {
        DATABASE_URL: 'pglite://memory',
        PORT: String(API_PORT),
        CORS_ORIGIN: WEB_URL,
        VITE_API_URL: API_URL,
        // The planner wizard reads the bundled Jonathan Rogers Park terrain and site data.
        TERRAIN_PROVIDER: 'static',
        SITE_FEATURES_PROVIDER: 'static',
        // The review spec opens the insights page, which asks for the summary. The fixed rules
        // write it, so the specs never depend on Gemini or spend a key's quota.
        AI_PROVIDER: 'rule-based',
        // Every outbound request fails, as in the root config, so a .env or shell value cannot
        // send the specs to the network.
        PARKSHAPE_OFFLINE: '1',
        // Every spec signs in from one address, many more times a minute than a resident does.
        RATE_LIMIT_LOGINS_PER_MINUTE: '600',
        // The full suite seeds far more designs an hour than one resident would, so the test tier
        // lifts the per-persona submission cap, as the root golden-path config does for votes.
        RATE_LIMIT_SUBMISSIONS_PER_HOUR: '2000',
      },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
    },
    {
      command: `pnpm run build && pnpm exec vite preview --port ${String(WEB_PORT)} --strictPort`,
      url: WEB_URL,
      env: { VITE_API_URL: API_URL, VITE_EDITOR_TEST_HOOK: 'on', VITE_MAP_TILES: 'static' },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
      timeout: 120_000,
    },
  ],
});
