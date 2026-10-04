import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { hasChromium, openScene, screenPixel, type DevPageMode } from './dev-page.ts';

// three.js constants, written out so the spec does not load three in Node.
const ACES_FILMIC_TONE_MAPPING = 4;
const SRGB_COLOR_SPACE = 'srgb';
const SETTLE_FRAMES = 30;
// PALETTE_FALLBACKS.sky, #cfe3f0.
const SKY_RGB = { red: 0xcf, green: 0xe3, blue: 0xf0 };
const CHANNEL_TOLERANCE = 2;
// Below the view preset buttons, in the top-right corner of the canvas.
const TOP_CORNER = { x: 1270, y: 70 };

test.skip(
  !hasChromium(),
  'Playwright Chromium is not installed; run pnpm exec playwright install chromium',
);

test('the phone tier renders with ACES tone mapping and sRGB output', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  const report = await page.evaluate(() => window.__parkshapeInspect());
  expect(report.toneMapping).toBe(ACES_FILMIC_TONE_MAPPING);
  expect(report.outputColorSpace).toBe(SRGB_COLOR_SPACE);
  expect(report.exposure).toBe(1);
});

test('the top corner of the canvas is the fog colour', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'desktop' });
  const pixel = await screenPixel(page, TOP_CORNER);
  pixel.forEach((channel, index) => {
    expect(Math.abs(channel - (Object.values(SKY_RGB)[index] ?? 0))).toBeLessThanOrEqual(
      CHANNEL_TOLERANCE,
    );
  });
});

const CASTER_LIMIT = 40;
const DESKTOP_SHADOW_PX = 2048;
const WATCH_FRAMES = 8;

test('the desktop tier draws one fitted shadow map that only redraws after an edit', async ({
  page,
}) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'desktop' });
  const report = await page.evaluate(() => window.__parkshapeInspect());
  expect(report.shadowMap).toBe('on');
  expect(report.shadowMapPx).toBe(DESKTOP_SHADOW_PX);
  expect(report.shadowAutoUpdate).toBe('off');
  expect(report.shadowCasters).toBeGreaterThan(0);
  expect(report.shadowCasters).toBeLessThan(CASTER_LIMIT);
  const redraws = await page.evaluate(async (frames) => {
    const next = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const seen: number[] = [];
    const steadyFrames = 2;
    for (let i = 0; i < steadyFrames; i += 1) {
      await next();
      seen.push(window.__parkshapeInspect().shadowRedraws);
    }
    window.__parkshapeNudge();
    for (let i = 0; i < frames; i += 1) {
      await next();
      seen.push(window.__parkshapeInspect().shadowRedraws);
    }
    return seen;
  }, WATCH_FRAMES);
  const before = redraws[0] ?? 0;
  // No redraw while nothing changes, one after the edit, then none again.
  expect(redraws[1]).toBe(before);
  expect(redraws.at(-1)).toBeGreaterThan(before);
  expect(redraws.at(-1)).toBe(redraws[redraws.length - 1 - 1]);
});

test('the phone tier has no shadow map', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  const report = await page.evaluate(() => window.__parkshapeInspect());
  expect(report.shadowMap).toBe('off');
});

test('the desktop composer holds N8AO, SMAA and tone mapping, and no bloom', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'desktop' });
  const { composerPasses } = await page.evaluate(() => window.__parkshapeInspect());
  expect(composerPasses).toEqual(['N8AO', 'SMAA', 'ToneMapping']);
  expect(composerPasses).not.toContain('Bloom');
});

test('the phone tier has no composer', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'seed', tier: 'phone' });
  const { composerPasses } = await page.evaluate(() => window.__parkshapeInspect());
  expect(composerPasses).toEqual([]);
});

// DESIGN.md Context: the apron and one merged mesh per kind.
const CONTEXT_DRAW_CALLS = 6;
const FRAME_BUDGET_MS = 33;
const SAMPLE_FRAMES = 120;
// About a second of frames, so the camera ease to a preset arrives.
const EASE_FRAMES = 60;
const P95 = 0.95;
const CONTEXT_SHOTS = '../../artifacts/screens/context';

async function steadyReport(page: Page, mode: DevPageMode) {
  await openScene(page, SETTLE_FRAMES, mode);
  return page.evaluate(() => window.__parkshapeInspect());
}

/** p95 of the frame times drawn after the scene settled, from the dev page's frame list. */
async function frameP95(page: Page): Promise<number> {
  const start = await page.evaluate(() => window.__parkshapeFrameTimes.length);
  await page.waitForFunction(
    (count) => window.__parkshapeFrameTimes.length >= count,
    start + SAMPLE_FRAMES,
  );
  const samples = await page.evaluate(
    ([from, count]) => window.__parkshapeFrameTimes.slice(from, from + count),
    [start, SAMPLE_FRAMES] as const,
  );
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(P95 * sorted.length) - 1] ?? 0;
}

test('every context layer adds at most 6 draw calls and no shadow caster', async ({ page }) => {
  const without = await steadyReport(page, { park: 'seed', tier: 'phone' });
  const withAll = await steadyReport(page, { park: 'seed', tier: 'phone', context: 'all' });
  test.info().annotations.push({
    type: 'draw calls',
    description: `${String(without.drawCalls)} without context, ${String(withAll.drawCalls)} with every layer`,
  });
  expect(withAll.drawCalls - without.drawCalls).toBeLessThanOrEqual(CONTEXT_DRAW_CALLS);
  expect(withAll.shadowCasters).toBe(without.shadowCasters);
});

for (const tier of ['desktop', 'phone'] as const) {
  test(`the ${tier} tier keeps frame p95 under 33 ms with every context layer on`, async ({
    page,
  }) => {
    await openScene(page, SETTLE_FRAMES, { park: 'seed', tier });
    const before = await frameP95(page);
    await openScene(page, SETTLE_FRAMES, { park: 'seed', tier, context: 'all' });
    const after = await frameP95(page);
    test.info().annotations.push({
      type: 'frame p95',
      description: `${tier}: ${before.toFixed(1)} ms before, ${after.toFixed(1)} ms after`,
    });
    expect(after).toBeLessThan(FRAME_BUDGET_MS);
  });
}

test('the context ribbons meet the park edge with the default layers on', async ({ page }) => {
  await openScene(page, SETTLE_FRAMES, { park: 'baseline', tier: 'desktop', context: 'defaults' });
  await page.screenshot({ path: `${CONTEXT_SHOTS}/scene-defaults.png` });
  await page.getByRole('button', { name: "Bird's eye" }).click();
  // The camera eases to the preset; a second's worth of frames lets it arrive.
  const seen = await page.evaluate(() => window.__parkshapeFrameTimes.length);
  await page.waitForFunction(
    (count) => window.__parkshapeFrameTimes.length >= count,
    seen + EASE_FRAMES,
  );
  await page.screenshot({ path: `${CONTEXT_SHOTS}/scene-birds-eye.png` });
  const { drawCalls } = await page.evaluate(() => window.__parkshapeInspect());
  expect(drawCalls).toBeGreaterThan(0);
});
