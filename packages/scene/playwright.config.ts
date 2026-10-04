import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const VIEWPORT = { width: 1280, height: 800 };
// The scene checks read the real GPU's shadow and composer state. Metal on macOS; elsewhere
// Chromium picks its default ANGLE backend.
const HARDWARE_GL =
  process.platform === 'darwin'
    ? ['--use-angle=metal', '--ignore-gpu-blocklist']
    : ['--ignore-gpu-blocklist'];
const desktop = { ...devices['Desktop Chrome'], viewport: VIEWPORT, deviceScaleFactor: 1 };

// Chromium only.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // Software WebGL is slow to start; the first load also pre-bundles three.js.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://localhost:${String(PORT)}`, viewport: VIEWPORT },
  projects: [
    {
      name: 'scene',
      testMatch: ['scene.spec.ts', 'review-walk.spec.ts'],
      use: { ...desktop, launchOptions: { args: HARDWARE_GL } },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: true,
    // Without this, Playwright waits on vite after the last test and the run never exits.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 },
  },
});
