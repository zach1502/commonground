import { readFile } from 'node:fs/promises';

import { expect, type Page } from '@playwright/test';

import insights from '../src/locales/en.insights.json' with { type: 'json' };
import planner from '../src/locales/en.planner.json' with { type: 'json' };

const { wizard } = planner.planner;

export type WizardStep = keyof typeof wizard.steps;

/** Presses Continue in the setup wizard and waits for the named step's heading. */
export async function continueTo(page: Page, step: WizardStep): Promise<void> {
  await page.getByRole('button', { name: wizard.continue }).click();
  await expect(page.getByRole('heading', { level: 2, name: wizard.steps[step] })).toBeVisible();
}

/** Downloads the insights page's top-10 CSV, checks its file name and returns its rows. */
export async function downloadTopTenCsv(page: Page, projectId: string): Promise<string[]> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: insights.insights.exports.csv }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`parkshape-${projectId}-top-10.csv`);
  return (await readFile(await download.path(), 'utf8')).trimEnd().split('\r\n');
}
