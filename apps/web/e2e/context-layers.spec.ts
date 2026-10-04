import { expect, test } from '@playwright/test';

import contextText from '../src/locales/en.context.json' with { type: 'json' };
import participation from '../src/locales/en.participation.json' with { type: 'json' };

import { RESIDENT, signIn } from './app-routes.ts';
import { createRecordedProject } from './context-project.ts';
import { openRecordedEditor } from './context-steps.ts';
import { saveBaselineFork, submitForReview } from './design-requests.ts';
import { SUBMITTABLE } from './editor-fixtures.ts';
import { API_URL } from './urls.ts';

const { layers } = contextText;
const SHOTS = '../../artifacts/screens/context';
const PHONE = { width: 360, height: 740 } as const;
const LAYER_COUNT = 5;
const DEFAULT_ON = 3;

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

let projectId = '';

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  projectId = await createRecordedProject(request);
  await request.dispose();
});

test('the Layers menu opens by keyboard with 3 of 5 layers on, and Esc returns focus', async ({
  page,
}) => {
  await openRecordedEditor(page, projectId);
  const button = page.getByRole('button', { name: layers.menu });
  await button.focus();
  await page.keyboard.press('Enter');
  const boxes = page.getByRole('group', { name: layers.menu }).getByRole('checkbox');
  await expect(boxes).toHaveCount(LAYER_COUNT);
  const checked = await boxes.evaluateAll(
    (all) => all.filter((box) => (box as HTMLInputElement).checked).length,
  );
  expect(checked).toBe(DEFAULT_ON);
  await page.screenshot({ path: `${SHOTS}/editor-layers-menu.png` });
  await page.getByRole('checkbox', { name: layers.kinds.street }).focus();
  await page.keyboard.press('Escape');
  await expect(boxes).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('the editor names the 4 bordering streets', async ({ page }) => {
  await openRecordedEditor(page, projectId);
  for (const name of ['W 7th Ave', 'W 8th Ave', 'Columbia St', 'Manitoba St']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/editor-layers-on.png` });
});

test('turning on Parking adds a legend row, and every layer off clears it', async ({ page }) => {
  await openRecordedEditor(page, projectId);
  const legend = page.locator('[data-context-legend]');
  await expect(legend.getByRole('listitem')).toHaveCount(DEFAULT_ON);
  await page.getByRole('button', { name: layers.menu }).click();
  await page.getByRole('checkbox', { name: layers.kinds.parking }).check();
  await expect(legend.getByText(layers.legend.parking)).toBeVisible();
  await legend.screenshot({ path: `${SHOTS}/editor-legend.png` });
  for (const kind of ['street', 'sidewalk', 'busStop', 'parking'] as const) {
    await page.getByRole('checkbox', { name: layers.kinds[kind] }).uncheck();
  }
  await expect(legend).toHaveCount(0);
  await page.keyboard.press('Escape');
  // The editor draws on demand; two animation frames let the last toggle reach the canvas.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.screenshot({ path: `${SHOTS}/editor-layers-off.png` });
});

test('the footer sources carry the TransLink notice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('contentinfo')).toContainText(
    'TransLink does not promise that this data is right or up to date.',
  );
});

test('the vote card 3D view draws the default layers with no street names', async ({ page }) => {
  const seeder = page.context().request;
  await seeder.post(`${API_URL}/auth/login`, { data: { persona: 'persona-rose-evergreen' } });
  const designId = await saveBaselineFork(seeder, projectId, {
    title: 'Garden loop',
    document: SUBMITTABLE,
  });
  await submitForReview(seeder, designId);
  await page.setViewportSize(PHONE);
  await signIn(page, RESIDENT);
  await page.goto(`/projects/${projectId}/vote`);
  await page.getByRole('button', { name: participation.vote.view3d }).first().click();
  await expect(page.locator('[data-scene-ready="true"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('W 7th Ave', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/vote-3d.png` });
});
