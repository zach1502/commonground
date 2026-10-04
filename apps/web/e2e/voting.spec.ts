import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import en from '../src/locales/en.json' with { type: 'json' };
import participation from '../src/locales/en.participation.json' with { type: 'json' };

import { signIn } from './app-routes.ts';
import { firstProjectId, saveBaselineFork, submitForReview } from './design-requests.ts';
import { SUBMITTABLE } from './editor-fixtures.ts';
import { createOwnProject } from './own-project.ts';
import { API_URL } from './urls.ts';
import { COMMENT, changeFirstResult, changeOnDesignPage } from './vote-change-steps.ts';
import {
  delayPictures,
  expectCaptionedPicture,
  posterColour,
  seedPicturedDesigns,
  shows,
} from './vote-pictures.ts';

const t = { ...en, ...participation };
const change = participation.voteChange;

const MOLLY = 'persona-molly-swingset';
const SEEDERS = ['persona-bob-walksadog', 'persona-kevin-kickabout'] as const;
const PER_SEEDER = 3;
// Titles a resident might write, so the vote and leaderboard shots show no seed slugs.
const TITLES = [
  'Shady lane walk',
  'Garden by the fence',
  'Swings and a picnic lawn',
  'Rain garden corner',
  'Quiet benches under the elms',
  'Loop path for strollers',
] as const;
const SEEDED_TITLE = new RegExp(TITLES.join('|'));
const MOBILE = { width: 360, height: 740 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const VOTE_BUDGET_MS = 20_000;
const BATCH_SIZE = 5;
const SCREENS = '../../artifacts/screens';
// The thumb zone is the lower 40 percent of a phone screen.
const THUMB_ZONE_TOP = 0.6;
const HTTP_OK = 200;
const HALF = 2;
const SECOND_CARD = 2;

/** Checks each named button sits fully inside the thumb zone with no scrolling. */
async function expectInThumbZone(page: Page, names: readonly string[]): Promise<void> {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const name of names) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box?.y ?? 0, name).toBeGreaterThanOrEqual(MOBILE.height * THUMB_ZONE_TOP);
    expect((box?.y ?? 0) + (box?.height ?? 0), name).toBeLessThanOrEqual(MOBILE.height);
  }
}

/**
 * Presses a control where it is drawn, the way a finger does. Locator clicks scroll a sticky
 * button to its place in the flow first, which a phone tap never does.
 */
async function tap(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error('the control to tap is not on screen');
  await page.mouse.click(box.x + box.width / HALF, box.y + box.height / HALF);
}

/** The page shows one filled button, and it is the one named. */
async function expectOnePrimary(page: Page, name: string): Promise<void> {
  const primary = page.locator('button[data-variant="primary"]:visible');
  await expect(primary).toHaveCount(1);
  await expect(primary).toHaveAccessibleName(name);
}

/** Forks the baseline as `persona` and submits it, so the queue has live designs to review. */
async function seedDesign(request: APIRequestContext, id: string, persona: string, title: string) {
  await request.post(`${API_URL}/auth/login`, { data: { persona } });
  const designId = await saveBaselineFork(request, id, { title, document: SUBMITTABLE });
  const outcome = await submitForReview(request, designId);
  expect(outcome.hardFailures).toHaveLength(0);
  return designId;
}

async function seedBatch(request: APIRequestContext): Promise<string> {
  const id = await createOwnProject(request, 'voting-queue');
  for (const [index, persona] of SEEDERS.entries()) {
    for (let n = 0; n < PER_SEEDER; n += 1) {
      await seedDesign(request, id, persona, TITLES[index * PER_SEEDER + n] ?? TITLES[0]);
    }
  }
  return id;
}

/** Votes up on the current design and waits for the reason chips to show. */
async function voteAndOpenChips(page: Page, position: number): Promise<void> {
  await expect(page.getByRole('status')).toContainText(
    `${String(position)} of ${String(BATCH_SIZE)}`,
  );
  await tap(page, page.getByRole('button', { name: t.vote.up }));
  await expect(page.getByRole('region', { name: t.vote.reasonsHeading })).toBeVisible();
}

/** Taps one reason, checks the chips wait for Next, then presses Next. */
async function giveReasonAndNext(page: Page, position: number): Promise<void> {
  const chips = page.getByRole('region', { name: t.vote.reasonsHeading });
  const trees = chips.getByRole('button', { name: t.vote.reasons.trees, exact: true });
  if (position === 1) {
    await expect(page.getByRole('heading', { name: t.vote.reasonsHeading })).toBeFocused();
  }
  await trees.click();
  await expect(trees).toHaveAttribute('aria-pressed', 'true');
  if (position === 1) {
    await page.screenshot({ path: `${SCREENS}/vote-chips-360.png` });
    await expectInThumbZone(page, [t.vote.reasonsNext]);
    await expectOnePrimary(page, t.vote.reasonsNext);
  }
  await expect(chips).toBeVisible();
  await tap(page, chips.getByRole('button', { name: t.vote.reasonsNext }));
  await expect(chips).toBeHidden();
}

/** Votes through a whole batch, returning how long the scripted votes took. */
async function voteThroughBatch(page: Page): Promise<number> {
  const start = Date.now();
  for (let position = 1; position <= BATCH_SIZE; position += 1) {
    await voteAndOpenChips(page, position);
    await giveReasonAndNext(page, position);
    if (position < BATCH_SIZE) {
      const next = position + 1;
      await expect(page.getByRole('status')).toContainText(
        `${String(next)} of ${String(BATCH_SIZE)}`,
      );
    }
  }
  return Date.now() - start;
}

test.describe('voting queue and leaderboard on a phone', () => {
  test('votes on five designs, sees progress, chips and the end-of-batch choice', async ({
    page,
  }) => {
    const id = await seedBatch(page.request);
    await signIn(page, MOLLY);
    await page.setViewportSize(MOBILE);
    await page.goto(`/projects/${id}/vote`);
    await expect(page.getByRole('button', { name: t.vote.up })).toBeVisible();
    await expect(page.getByRole('img', { name: SEEDED_TITLE })).toBeVisible();
    await expectInThumbZone(page, [t.vote.up, t.vote.down, t.vote.skip]);
    await expectOnePrimary(page, t.vote.up);
    await page.screenshot({ path: `${SCREENS}/vote-360.png` });

    const elapsedMs = await voteThroughBatch(page);
    await expect(page.getByRole('button', { name: t.vote.voteMore })).toBeVisible();
    test.info().annotations.push({ type: 'vote-flow-ms', description: String(elapsedMs) });
    expect(elapsedMs).toBeLessThan(VOTE_BUDGET_MS);
    await page.screenshot({ path: `${SCREENS}/vote-end-360.png` });
    await changeFirstResult(page);

    await page.getByRole('link', { name: t.vote.seeLeaderboard }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}/leaderboard$`));
    await expect(page.getByRole('table')).toBeVisible();
    // Five designs were voted on; the sixth was never shown, so its author stays hidden.
    await expect(page.getByText(t.leaderboard.anonymous)).toHaveCount(1);
    await page.screenshot({ path: `${SCREENS}/leaderboard-360.png` });
    await page.setViewportSize(DESKTOP);
    await page.screenshot({ path: `${SCREENS}/leaderboard-1440.png` });
  });
});

test.describe('vote card pictures', () => {
  test('each card shows its own stored picture, never the last one under the new name', async ({
    page,
  }) => {
    const id = await createOwnProject(page.request, 'voting-pictures');
    const pictures = await seedPicturedDesigns(page, id, (persona, title) =>
      seedDesign(page.request, id, persona, title),
    );
    await delayPictures(page);
    await signIn(page, MOLLY);
    await page.setViewportSize(MOBILE);
    await page.goto(`/projects/${id}/vote`);
    let shown = await expectCaptionedPicture(page, pictures);
    for (let position = SECOND_CARD; position <= pictures.size; position += 1) {
      await tap(page, page.getByRole('button', { name: t.vote.up }));
      await tap(page, page.getByRole('button', { name: t.vote.reasonsNext }));
      await expect(page.getByRole('status')).toContainText(`${String(position)} of `);
      await expect(page.locator('.web-vote__ghost')).toHaveCount(0);
      // The outgoing copy is gone, so the stage shows only the new card: never the last picture.
      const drawn = await posterColour(page);
      expect(shows(drawn, shown.colour), `${shown.title} drawn under the new name`).toBe(false);
      const next = await expectCaptionedPicture(page, pictures);
      expect(next.url).not.toBe(shown.url);
      shown = next;
    }
  });
});

/** Reads the project's baseline as the signed-in page user, the way Compare with today does. */
async function baselineTitle(request: APIRequestContext, id: string): Promise<string> {
  const project = await request.get(`${API_URL}/projects/${id}`);
  const { baselineDesignId } = (await project.json()) as { baselineDesignId: string | null };
  if (baselineDesignId === null) throw new Error('setup created no baseline');
  const baseline = await request.get(`${API_URL}/designs/${baselineDesignId}`);
  expect(baseline.status()).toBe(HTTP_OK);
  return ((await baseline.json()) as { title: string }).title;
}

const posterName = (title: string) => t.vote.posterAlt.replace('{title}', title);

test.describe('comparing with today', () => {
  test('Compare with today swaps the poster to the site as it is now', async ({ page }) => {
    // A design of its own keeps the queue non-empty and the seeders under the live cap.
    const id = await firstProjectId(page.request);
    const title = 'Compared design';
    await seedDesign(page.request, id, 'persona-sally-smoothpath', title);
    await signIn(page, MOLLY);
    await page.setViewportSize(DESKTOP);
    await page.goto(`/projects/${id}/vote`);
    await expect(
      page.getByRole('img', { name: new RegExp(`${SEEDED_TITLE.source}|Compared design`) }),
    ).toBeVisible();
    const today = await baselineTitle(page.request, id);
    expect(today).not.toBe(title);
    await page.getByRole('button', { name: t.vote.compare }).click();
    await expect(page.getByRole('img', { name: posterName(today), exact: true })).toBeVisible();
    await expect(page.getByText(t.vote.loadingDesign)).toBeHidden();
  });
});

test.describe('changing a vote', () => {
  test('a second vote on the same design replaces the first', async ({ page }) => {
    // A design of its own keeps the counts exact and the seeders under the live cap.
    const designId = await seedDesign(
      page.request,
      await firstProjectId(page.request),
      'persona-gail-marigold',
      'Replaced vote',
    );
    await signIn(page, MOLLY);
    await page.request.post(`${API_URL}/votes`, {
      data: { designId, value: 1, reasons: ['trees'] },
    });
    await page.request.post(`${API_URL}/votes`, {
      data: { designId, value: -1, reasons: ['too-expensive'] },
    });
    const mine = await page.request.get(`${API_URL}/designs/${designId}/my-vote`);
    const { vote } = (await mine.json()) as { vote: { value: number; reasons: string[] } };
    expect(vote.value).toBe(-1);
    expect(vote.reasons).toEqual(['too-expensive']);
  });

  test('changing a vote from the design page updates the counts', async ({ page }) => {
    // A design of its own keeps the counts exact and the seeders under the live cap.
    const designId = await seedDesign(
      page.request,
      await firstProjectId(page.request),
      'persona-rose-evergreen',
      'Changed vote',
    );
    await signIn(page, MOLLY);
    await page.request.post(`${API_URL}/votes`, { data: { designId, value: 1, reasons: [] } });
    await page.goto(`/designs/${designId}`);
    await page.getByRole('button', { name: t.designPage.yourVoteDown }).click();
    await expect(page.getByText(t.designPage.yourVoteSaved)).toBeVisible();
    const stored = await page.request.get(`${API_URL}/designs/${designId}`);
    const design = (await stored.json()) as { up: number; down: number };
    expect(design).toMatchObject({ up: 0, down: 1 });
  });
});

test.describe('changing and withdrawing a vote with a comment', () => {
  test('votes, changes the vote with a comment, keeps it after a reload, then withdraws it', async ({
    page,
  }) => {
    const projectId = await createOwnProject(page.request, 'vote-editing');
    const designId = await seedDesign(
      page.request,
      projectId,
      'persona-gail-marigold',
      'Edited vote',
    );
    await signIn(page, MOLLY);
    await page.goto(`/designs/${designId}`);
    await page.getByRole('button', { name: t.designPage.yourVoteUp }).click();
    await expect(page.getByText(t.designPage.yourVoteSaved)).toBeVisible();

    await changeOnDesignPage(page);
    await page.reload();
    await expect(page.getByText(t.designPage.yourVoteDownCurrent)).toBeVisible();
    await page.getByRole('button', { name: change.change }).click();
    await expect(page.getByRole('textbox', { name: change.commentLabel })).toHaveValue(COMMENT);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: change.change })).toBeFocused();

    await page.getByRole('button', { name: change.withdraw }).click();
    await expect(page.getByText(change.withdrawn)).toBeVisible();
    const mine = await page.request.get(`${API_URL}/designs/${designId}/my-vote`);
    expect(((await mine.json()) as { vote: unknown }).vote).toBeNull();
    const stored = await page.request.get(`${API_URL}/designs/${designId}`);
    expect(await stored.json()).toMatchObject({ up: 0, down: 0 });
  });
});
