import { expect, test, type Page } from '@playwright/test';

import { hasChromium, openScene } from './dev-page.ts';

declare global {
  interface Window {
    /** Written by dev/walk-probe.ts on each walk frame. */
    __parkshapeWalk: {
      readonly eye: { readonly x: number; readonly y: number; readonly z: number };
      readonly groundM: number;
    } | null;
    __parkshapeWalkMode: 'walk' | 'overview';
    __parkshapeWalkParcel: readonly { readonly x: number; readonly z: number }[];
  }
}

const SETTLE_FRAMES = 30;
// DESIGN.md "Walk": the eye is 1.6 m over the ground, and a held key walks at 1.4 m/s.
const EYE_HEIGHT_M = 1.6;
const EYE_TOLERANCE_M = 0.05;
const HOLD_MS = 1000;
const MIN_WALKED_M = 1;
const SAMPLE_FRAMES = 120;
const FRAME_BUDGET_MS = 33;
const P95 = 0.95;
const EDGE_HOLD_MS = 10_000;
// The scene under the toolbar, whose focus ring moves to Walk the park on the way back.
const BELOW_TOOLBAR = { x: 0, y: 64, width: 1280, height: 736 };
const REDUCED_STEP_M = 4;
const EDGE_TEST_TIMEOUT_MS = 180_000;
const STEP_DECIMALS = 1;
// A ray crossing the ring an odd number of times starts inside it.
const EVEN_ODD = 2;

test.skip(
  !hasChromium(),
  'Playwright Chromium is not installed; run pnpm exec playwright install chromium',
);

async function startWalk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Walk the park' }).click();
  await page.waitForFunction(() => window.__parkshapeWalk !== null);
  await expect(page.getByRole('application', { name: 'Walk view' })).toBeFocused();
}

async function probe(page: Page) {
  const found = await page.evaluate(() => window.__parkshapeWalk);
  if (found === null) throw new Error('no walk frame yet');
  return found;
}

function percentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

test('walks at eye height while ArrowUp is held, and Escape restores the overview', async ({
  page,
}) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  const before = await page.screenshot({ clip: BELOW_TOOLBAR });
  await startWalk(page);
  const start = await probe(page);
  expect(Math.abs(start.eye.y - start.groundM - EYE_HEIGHT_M)).toBeLessThan(EYE_TOLERANCE_M);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(HOLD_MS);
  await page.keyboard.up('ArrowUp');
  const after = await probe(page);
  const walked = Math.hypot(after.eye.x - start.eye.x, after.eye.z - start.eye.z);
  expect(walked).toBeGreaterThanOrEqual(MIN_WALKED_M);
  expect(Math.abs(after.eye.y - after.groundM - EYE_HEIGHT_M)).toBeLessThan(EYE_TOLERANCE_M);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Walk the park' })).toBeFocused();
  expect(await page.evaluate(() => window.__parkshapeWalkMode)).toBe('overview');
  // The overview draws again from the saved pose, so the scene matches the one before the walk.
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const restored = await page.screenshot({ clip: BELOW_TOOLBAR });
  expect(Buffer.compare(restored, before)).toBe(0);
});

test('stays inside the parcel after 10 s of walking into its edge', async ({ page }) => {
  test.setTimeout(EDGE_TEST_TIMEOUT_MS);
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  await startWalk(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(EDGE_HOLD_MS);
  await page.keyboard.up('ArrowDown');
  const inside = await page.evaluate((evenOdd) => {
    const walk = window.__parkshapeWalk;
    if (walk === null) return false;
    const ring = window.__parkshapeWalkParcel;
    let crossings = 0;
    ring.forEach((corner, index) => {
      const next = ring[(index + 1) % ring.length] ?? corner;
      const spans = corner.z > walk.eye.z !== next.z > walk.eye.z;
      const atX = ((next.x - corner.x) * (walk.eye.z - corner.z)) / (next.z - corner.z) + corner.x;
      if (spans && walk.eye.x < atX) crossings += 1;
    });
    return crossings % evenOdd === 1;
  }, EVEN_ODD);
  expect(inside).toBe(true);
  const { eye, groundM } = await probe(page);
  expect(Math.abs(eye.y - groundM - EYE_HEIGHT_M)).toBeLessThan(EYE_TOLERANCE_M);
});

for (const tier of ['desktop', 'phone'] as const) {
  test(`holds a walk frame p95 under 33 ms on the ${tier} tier`, async ({ page }) => {
    await openScene(page, SETTLE_FRAMES, { park: 'seed', tier });
    await startWalk(page);
    const from = await page.evaluate(() => window.__parkshapeFrameTimes.length);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(
      ([start, count]) => window.__parkshapeFrameTimes.length >= start + count,
      [from, SAMPLE_FRAMES] as const,
    );
    await page.keyboard.up('ArrowUp');
    const sample = await page.evaluate(
      ([start, count]) => window.__parkshapeFrameTimes.slice(start, start + count),
      [from, SAMPLE_FRAMES] as const,
    );
    expect(sample).toHaveLength(SAMPLE_FRAMES);
    const p95 = percentile(sample, P95);
    test.info().annotations.push({ type: 'walk-frame-p95-ms', description: p95.toFixed(1) });
    expect(p95).toBeLessThan(FRAME_BUDGET_MS);
  });
}

test('moves in 4 m steps under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  await startWalk(page);
  const start = await probe(page);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(
    ([x, z]) => {
      const walk = window.__parkshapeWalk;
      return walk !== null && Math.hypot(walk.eye.x - x, walk.eye.z - z) > 0;
    },
    [start.eye.x, start.eye.z] as const,
  );
  const after = await probe(page);
  const stepped = Math.hypot(after.eye.x - start.eye.x, after.eye.z - start.eye.z);
  expect(stepped).toBeCloseTo(REDUCED_STEP_M, STEP_DECIMALS);
});
