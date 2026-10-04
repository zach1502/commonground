import { expect, test, type Page } from '@playwright/test';

import {
  clickGround,
  editorState,
  holdBrush,
  pickCatalogItem,
  waitForCanvas,
  type GroundPoint,
} from '../apps/web/e2e/editor-page.ts';
import describeText from '../apps/web/src/locales/en.describe.json' with { type: 'json' };
import designText from '../apps/web/src/locales/en.design.json' with { type: 'json' };
import en from '../apps/web/src/locales/en.json' with { type: 'json' };
import participation from '../apps/web/src/locales/en.participation.json' with { type: 'json' };

import {
  API_URL,
  DESKTOP,
  mark,
  PHONE,
  RESIDENT_NAME,
  residentLogin,
  seedSummary,
} from './golden-path.ts';

const DESCRIPTION = 'a playground near the gate, a dog area on the north side and a loop path';
const BATCH = 5;
const TOP_COUNT = 5;
// Open ground on the 176 m by 86 m parcel, tried in turn until one takes the item or brush.
const SPOTS: readonly GroundPoint[] = [
  { x: 60, y: 45 },
  { x: 90, y: 30 },
  { x: 40, y: 60 },
  { x: 100, y: 55 },
  { x: 75, y: 20 },
];
const { describe: describePage, describePreview } = describeText;
const vote = participation.vote;

interface SubmitBody {
  readonly status: string;
  readonly softWarnings: readonly { readonly badge: string }[];
}

async function describeAndOpen(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/design/new`);
  await page.getByRole('button', { name: en.newDesign.describe }).click();
  await page.getByLabel(describePage.field).fill(DESCRIPTION);
  await page.getByRole('button', { name: describePage.generate }).click();
  await expect(page.getByRole('heading', { level: 1, name: describePreview.label })).toBeVisible({
    timeout: 60_000,
  });
  const items = await page.evaluate(() => {
    const hook = (window as { __parkshapePreview?: { document: { items: { locked: boolean }[] } } })
      .__parkshapePreview;
    return (hook?.document.items ?? []).filter((item) => !item.locked).length;
  });
  expect(items).toBeGreaterThan(0);
  await page.getByRole('link', { name: describePreview.openEditor }).click();
  await page.waitForURL(/\/design\/(?!describe)[^/]+$/);
  await waitForCanvas(page);
  const dismiss = page.getByRole('button', { name: en.editor.hints.dismiss });
  if (await dismiss.first().isVisible()) await dismiss.first().click();
}

async function placeBench(page: Page): Promise<void> {
  const before = (await editorState(page)).document.items.length;
  for (const spot of SPOTS) {
    await pickCatalogItem(page, 'seating', 'bench');
    await clickGround(page, spot);
    const after = (await editorState(page)).document.items.length;
    if (after > before) return;
    await page.keyboard.press('Escape');
  }
  throw new Error('no open spot took the bench');
}

async function gradeCells(page: Page): Promise<number> {
  const state = (await editorState(page)) as unknown as {
    document: { gradeDelta: { cells: readonly unknown[] } };
  };
  return state.document.gradeDelta.cells.length;
}

async function terraformOnce(page: Page): Promise<void> {
  await page.getByRole('button', { name: en.editor.tools.terraform }).click();
  for (const spot of SPOTS) {
    await holdBrush(page, spot);
    if ((await gradeCells(page)) > 0) return;
  }
  throw new Error('the brush changed no cell');
}

async function submit(page: Page): Promise<SubmitBody> {
  await page.getByRole('button', { name: en.editor.submit }).click();
  const response = page.waitForResponse(
    (r) => r.url().startsWith(API_URL) && /\/designs\/[^/]+\/submit$/.test(r.url()),
  );
  await page.getByRole('dialog').getByRole('button', { name: designText.submit.action }).click();
  return (await (await response).json()) as SubmitBody;
}

async function voteFive(page: Page, projectId: string): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto(`/projects/${projectId}/vote`);
  for (let position = 1; position <= BATCH; position += 1) {
    await expect(page.getByRole('status')).toContainText(`${String(position)} of ${String(BATCH)}`);
    await page.getByRole('button', { name: vote.up, exact: true }).click();
    const chips = page.getByRole('region', { name: vote.reasonsHeading });
    await expect(chips).toBeVisible();
    await chips.getByRole('button', { name: vote.reasonsNext }).click();
  }
  await expect(page.getByRole('button', { name: vote.voteMore })).toBeVisible();
}

test('a resident describes a park, edits and submits it, votes on five and sees the leaderboard', async ({
  page,
}) => {
  const seeded = seedSummary();
  const started = Date.now();
  await page.setViewportSize(DESKTOP);
  await residentLogin(page, RESIDENT_NAME);

  await describeAndOpen(page, seeded.projectId);
  mark('describe it to editor', started);
  await placeBench(page);
  await terraformOnce(page);
  const outcome = await submit(page);
  expect(outcome.status).toBe('submitted');
  expect(Array.isArray(outcome.softWarnings)).toBe(true);
  expect(outcome.softWarnings.every(({ badge }) => badge.length > 0)).toBe(true);
  mark('resident design', started);

  const voting = Date.now();
  await voteFive(page, seeded.projectId);
  mark('resident votes', voting);
  await page.getByRole('link', { name: vote.seeLeaderboard }).click();
  const rows = page.getByRole('table').getByRole('row');
  for (const [index, { title }] of seeded.topFive.slice(0, TOP_COUNT).entries()) {
    await expect(rows.nth(index + 1)).toContainText(title);
  }
  mark('resident total', started);
});
