import { expect, test, type Page } from '@playwright/test';

import type {} from '../src/design/viewer-hook.ts';
import insightsText from '../src/locales/en.insights.json' with { type: 'json' };
import reviewText from '../src/locales/en.review.json' with { type: 'json' };

import { RESIDENT, signIn, STAFF } from './app-routes.ts';
import { firstProjectId, saveBaselineFork, submitForReview } from './design-requests.ts';
import { SUBMITTABLE } from './editor-fixtures.ts';
import { API_URL } from './urls.ts';

const { review, walk } = reviewText;
const feedback = insightsText.insights.feedback;
const AUTHOR = 'persona-rose-evergreen';
const SENTENCE = 'This bench should face the playground';
// A bench in the middle of the 120 m square parcel, where the review camera sees it whole.
const BENCH = { id: 'review-bench', x: 60, y: 60 };
// Half the bench's 0.9 m height, so the tap lands on the seat, not the ground behind it.
const SEAT_LIFT_M = 0.45;
// DESIGN.md "Walk": the eye is 1.6 m over the ground, and a held key walks at 1.4 m/s.
const EYE_HEIGHT_M = 1.6;
const EYE_TOLERANCE_M = 0.05;
const HOLD_MS = 1000;
const MIN_WALKED_M = 1;
// Most of the step goes the way the camera faces.
const FORWARD_SHARE = 0.9;
const RESTORE_TOLERANCE_M = 0.01;
const SCENE_TIMEOUT_MS = 60_000;
const HALF = 2;
const HTTP_OK = 200;

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: { width: 1440, height: 900 } });

let designId = '';

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  await request.post(`${API_URL}/auth/login`, { data: { persona: AUTHOR } });
  const projectId = await firstProjectId(request);
  const bench = {
    id: BENCH.id,
    catalogId: 'bench',
    position: { x: BENCH.x, y: BENCH.y },
    rotationDeg: 0,
    locked: false,
  };
  const document = { ...SUBMITTABLE, items: [...SUBMITTABLE.items, bench] };
  designId = await saveBaselineFork(request, projectId, { title: 'Bench by the oak', document });
  await submitForReview(request, designId);
  await request.dispose();
});

async function waitForViewer(page: Page): Promise<void> {
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({
    timeout: SCENE_TIMEOUT_MS,
  });
  await page.waitForFunction(() => window.__parkshapeViewer?.cameraPose() != null);
}

async function cameraPose(page: Page) {
  const pose = await page.evaluate(() => window.__parkshapeViewer?.cameraPose() ?? null);
  if (pose === null) throw new Error('the viewer has no camera yet');
  return pose;
}

/** The overview pose once the arrival flight has ended: two reads a moment apart agree. */
async function settledPose(page: Page) {
  let previous = await cameraPose(page);
  await expect
    .poll(async () => {
      const now = await cameraPose(page);
      const moved = distance(now.position, previous.position);
      previous = now;
      return moved;
    })
    .toBeLessThan(RESTORE_TOLERANCE_M / HALF);
  return previous;
}

async function walkFrame(page: Page) {
  const frame = await page.evaluate(() => window.__parkshapeViewer?.walk() ?? null);
  if (frame === null) throw new Error('no walk frame yet');
  return frame;
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

test('a resident taps a bench, comments Move, and the chip counts it', async ({ page }) => {
  await signIn(page, RESIDENT);
  await page.goto(`/designs/${designId}`);
  await page.getByRole('link', { name: review.action }).click();
  await expect(page).toHaveURL(new RegExp(`/designs/${designId}/review$`));
  await waitForViewer(page);
  const seat = await page.evaluate(
    ([point, lift]) => window.__parkshapeViewer?.screenPointOf(point, lift) ?? null,
    [{ x: BENCH.x, y: BENCH.y }, SEAT_LIFT_M] as const,
  );
  if (seat === null) throw new Error('the bench is behind the camera');
  await page.mouse.click(seat.x, seat.y);
  await expect(page.getByRole('heading', { name: /^Bench, / })).toBeFocused();
  // The radios are drawn as chips; a person presses the chip, which is the radio's label.
  const move = page.getByRole('radio', { name: review.kind.move, exact: true });
  await page.locator('label', { has: move }).click();
  await expect(move).toBeChecked();
  await page.getByLabel(review.composer.text).fill(SENTENCE);
  await page.getByRole('button', { name: review.composer.add }).click();
  await expect(page.getByRole('status')).toContainText(/Comment added on Bench, /);
  await expect(page.getByRole('img', { name: /^1 comment on Bench/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Bench, .+, 1 comment$/ })).toBeVisible();
});

test('a planner sees the comment under the bench, and the CSV has its row', async ({ page }) => {
  await signIn(page, STAFF);
  const projectId = await firstProjectId(page.request);
  await page.goto(`/staff/projects/${projectId}/insights`);
  const section = page.getByRole('region', { name: feedback.heading });
  await section.getByLabel(feedback.picker).selectOption(designId);
  const group = section
    .locator('.web-feedback__group')
    .filter({ has: page.getByRole('heading', { level: 4, name: /^Bench, / }) });
  await expect(
    group.getByRole('article', { name: `${review.kind.move}: ${SENTENCE}` }),
  ).toBeVisible();
  const href = await section.getByRole('link', { name: feedback.download }).getAttribute('href');
  if (href === null) throw new Error('the CSV link has no href');
  const csv = await page.request.get(href);
  expect(csv.status()).toBe(HTTP_OK);
  const rows = (await csv.text()).trimEnd().split('\r\n');
  const row = rows.find((line) => line.includes(SENTENCE));
  expect(row).toMatch(/^"?Bench by the oak"?,item,seating,"?Bench, [^,]+"?,review-bench,move,/);
});

test('Walk the park walks forward at eye height, and Escape puts the camera back', async ({
  page,
}) => {
  await signIn(page, RESIDENT);
  await page.goto(`/designs/${designId}`);
  await waitForViewer(page);
  const before = await settledPose(page);
  await page.getByRole('button', { name: walk.start }).click();
  await expect(page.getByRole('application', { name: walk.surface })).toBeFocused();
  await page.waitForFunction(() => window.__parkshapeViewer?.walkMode() === 'walk');
  await page.waitForFunction(() => window.__parkshapeViewer?.walk() != null);
  const start = await walkFrame(page);
  expect(Math.abs(start.eye.y - start.groundM - EYE_HEIGHT_M)).toBeLessThan(EYE_TOLERANCE_M);
  const facing = (await cameraPose(page)).facing;
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(HOLD_MS);
  await page.keyboard.up('ArrowUp');
  const after = await walkFrame(page);
  const step = { x: after.eye.x - start.eye.x, z: after.eye.z - start.eye.z };
  const walked = Math.hypot(step.x, step.z);
  expect(walked).toBeGreaterThanOrEqual(MIN_WALKED_M);
  const flat = Math.hypot(facing.x, facing.z);
  const ahead = (step.x * facing.x + step.z * facing.z) / flat;
  expect(ahead).toBeGreaterThan(walked * FORWARD_SHARE);
  expect(Math.abs(after.eye.y - after.groundM - EYE_HEIGHT_M)).toBeLessThan(EYE_TOLERANCE_M);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: walk.start })).toBeFocused();
  expect(await page.evaluate(() => window.__parkshapeViewer?.walkMode())).toBe('overview');
  // The canvas has its own React root, so the walk camera lets go on the next drawn frame.
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const restored = await cameraPose(page);
  expect(distance(restored.position, before.position)).toBeLessThan(RESTORE_TOLERANCE_M);
  if (before.target === null || restored.target === null) throw new Error('the orbit has no aim');
  expect(distance(restored.target, before.target)).toBeLessThan(RESTORE_TOLERANCE_M);
});
