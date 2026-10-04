import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// One canvas per lineup row: trees, big items, ground tiles, furniture.
const ROW_COUNT = 4;
const SCREENSHOT = path.join(REPO_ROOT, 'artifacts', 'screens', 'asset-lineup.png');

declare global {
  interface Window {
    __lineupReady: boolean;
  }
}

test.skip(
  !existsSync(chromium.executablePath()),
  'Playwright Chromium is not installed; run pnpm exec playwright install chromium',
);

test('lineup draws every model', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/lineup.html');
  await page.waitForFunction(() => window.__lineupReady);
  mkdirSync(path.dirname(SCREENSHOT), { recursive: true });
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  expect(errors).toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(ROW_COUNT);
});
