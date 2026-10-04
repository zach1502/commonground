import { defineConfig, devices } from '@playwright/test';

const PORT = 5176;

// Takes the lineup screenshot for a person to look at; it is not a pixel comparison.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${String(PORT)}`,
    viewport: { width: 1600, height: 1400 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `pnpm exec vite --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/lineup.html`,
    reuseExistingServer: true,
    // Without this, Playwright waits on vite after the last test and the run never exits.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
  },
});
