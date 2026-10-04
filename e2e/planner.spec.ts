import { expect, test, type Page } from '@playwright/test';

import { continueTo, downloadTopTenCsv } from '../apps/web/e2e/staff-steps.ts';
import insights from '../apps/web/src/locales/en.insights.json' with { type: 'json' };
import plannerText from '../apps/web/src/locales/en.planner.json' with { type: 'json' };

import { API_URL, mark, seedSummary, staffLogin } from './golden-path.ts';

// rank, design_id, title, ...
const TITLE_COLUMN = 2;
const TOP_COUNT = 5;
const HTTP_OK = 200;
// Only the e2e run creates this project; the demo seed never does.
const NEW_PROJECT = 'E2E test project';
const { site, publish, home } = plannerText.planner;
const text = insights.insights;

/** Runs the six setup steps on the bundled fixture and publishes the project. */
async function publishThroughWizard(page: Page): Promise<void> {
  await page.getByRole('link', { name: home.newProject }).click();
  await page.getByRole('textbox', { name: site.searchLabel }).fill('Jonathan Rogers Park');
  await page.getByRole('button', { name: site.search }).click();
  await expect(page.getByText(site.found.replace('{name}', 'Jonathan Rogers Park'))).toBeVisible();
  for (const step of ['terrain', 'review', 'parameters', 'refine', 'publish'] as const) {
    await continueTo(page, step);
  }
  await page.getByRole('textbox', { name: publish.nameLabel }).fill(NEW_PROJECT);
  await page.getByRole('button', { name: publish.publish }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('link', { name: NEW_PROJECT, exact: true })).toBeVisible();
}

test('a planner publishes and closes a project, reads insights and the summary, and exports', async ({
  page,
}) => {
  const seeded = seedSummary();
  const started = Date.now();
  await staffLogin(page);

  await publishThroughWizard(page);
  mark('planner wizard', started);
  await page.getByRole('button', { name: home.close.replace('{name}', NEW_PROJECT) }).click();
  await expect(
    page.getByRole('button', { name: home.reopen.replace('{name}', NEW_PROJECT) }),
  ).toBeVisible();

  await page.goto(`/staff/projects/${seeded.projectId}/insights`);
  const { designs, voters, votes } = seeded.counts;
  await expect(page.getByLabel(text.headlineLabel).getByRole('definition')).toHaveText(
    [designs, voters, votes].map(String),
  );

  const summary = await page.request.get(`${API_URL}/projects/${seeded.projectId}/summary`);
  expect(summary.status()).toBe(HTTP_OK);
  const { themes } = (await summary.json()) as { themes: unknown[] };
  expect(themes.length).toBeGreaterThan(0);

  const rows = await downloadTopTenCsv(page, seeded.projectId);
  expect(rows.slice(1, TOP_COUNT + 1).map((row) => row.split(',')[TITLE_COLUMN])).toEqual(
    seeded.topFive.map(({ title }) => title),
  );
  mark('planner total', started);
});
