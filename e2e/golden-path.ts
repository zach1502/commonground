import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

import en from '../apps/web/src/locales/en.json' with { type: 'json' };

import { API_URL } from './urls.ts';

export const SEED_SUMMARY = fileURLToPath(
  new URL('../test-results/seed-summary.json', import.meta.url),
);
export const RESIDENT_NAME = 'Molly Swingset';
export const DESKTOP = { width: 1440, height: 900 } as const;
export const PHONE = { width: 360, height: 740 } as const;

/** The seed summary the seeded API wrote before it started listening. */
export interface SeedSummary {
  readonly projectId: string;
  readonly counts: {
    readonly designs: number;
    readonly votes: number;
    readonly voters: number;
    readonly selfReports: number;
  };
  readonly topFive: readonly { readonly title: string }[];
}

export function seedSummary(): SeedSummary {
  return JSON.parse(readFileSync(SEED_SUMMARY, 'utf8')) as SeedSummary;
}

/** Logs a resident in through the login page, as a person would. */
export async function residentLogin(page: Page, name: string): Promise<void> {
  await page.goto('/login');
  await page.getByText(name, { exact: true }).click();
  await expect(page.getByRole('radio', { name: new RegExp(`^${name}`) })).toBeChecked();
  await page.getByRole('button', { name: new RegExp(en.login.bcsc) }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Logs the planner in through the staff login page. */
export async function staffLogin(page: Page): Promise<void> {
  await page.goto('/staff/login');
  await page.getByRole('button', { name: new RegExp(en.staffLogin.button) }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

/** Records a step's time on the test, so the report shows where a run spends it. */
export function mark(label: string, started: number): void {
  const elapsed = Date.now() - started;
  process.stdout.write(`golden-path ${label}: ${String(elapsed)} ms\n`);
}

export { API_URL };
