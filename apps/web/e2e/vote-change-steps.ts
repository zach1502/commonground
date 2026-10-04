import { expect, type Locator, type Page } from '@playwright/test';

import en from '../src/locales/en.json' with { type: 'json' };
import participation from '../src/locales/en.participation.json' with { type: 'json' };

import { API_URL } from './urls.ts';

const t = { ...en, ...participation };
const change = participation.voteChange;
// WCAG 2.5.8 target size, in CSS pixels.
const MIN_TARGET_PX = 24;
export const COMMENT = 'Less paving by the garden, please.';

/** On the end of the batch, turns the first up vote down with a comment; the count stays 5. */
export async function changeFirstResult(page: Page): Promise<void> {
  const first = page.locator('.web-vote__result').first();
  await first.getByRole('button', { name: change.change }).click();
  await expect(page.getByRole('heading', { name: change.heading })).toBeFocused();
  await page
    .getByRole('group', { name: change.choiceLabel })
    .getByRole('button', { name: t.vote.down })
    .click();
  await page.getByRole('textbox', { name: change.commentLabel }).fill(COMMENT);
  await page.getByRole('button', { name: change.save }).click();
  await expect(first.getByText(t.designPage.yourVoteSaved)).toBeVisible();
  await expect(first).toContainText(t.vote.resultDown);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You voted on 5 designs');
  await expect(first.getByRole('button', { name: change.change })).toBeFocused();
}

/** Change from the keyboard: down, a reason and a comment with its count, then Save vote. */
export async function changeOnDesignPage(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: change.change });
  await expectTargetSize(open);
  await expectTargetSize(page.getByRole('button', { name: change.withdraw }));
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: change.heading })).toBeFocused();
  const choices = page.getByRole('group', { name: change.choiceLabel });
  await choices.getByRole('button', { name: t.vote.down }).click();
  await page.getByRole('button', { name: t.vote.reasons['too-paved'], exact: true }).click();
  const box = page.getByRole('textbox', { name: change.commentLabel });
  await box.fill(COMMENT);
  await expect(page.getByText(`${String(COMMENT.length)} of 500 characters`)).toBeVisible();
  for (const name of [change.save, change.keep]) {
    await expectTargetSize(page.getByRole('button', { name }));
  }
  await page.getByRole('button', { name: change.save }).click();
  await expect(page.getByText(t.designPage.yourVoteSaved)).toBeVisible();
  const mine = await page.request.get(`${API_URL}/designs/${designId(page)}/my-vote`);
  expect(await mine.json()).toMatchObject({
    vote: { value: -1, reasons: ['too-paved'], comment: COMMENT },
  });
}

function designId(page: Page): string {
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function expectTargetSize(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}
