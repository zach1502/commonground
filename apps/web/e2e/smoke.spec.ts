import { expect, test, type Page } from '@playwright/test';

import en from '../src/locales/en.json' with { type: 'json' };
import participation from '../src/locales/en.participation.json' with { type: 'json' };

import { RESIDENT, signIn } from './app-routes.ts';
import { newScreenFixture, openVotePoster, type ScreenFixture } from './app-screens.ts';

// Each page the resident path needs, opened once per browser: README.md "Browser support".
const PARK = 'Jonathan Rogers Park';

async function expectHeading(page: Page, name: string) {
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

let fixture: ScreenFixture | null = null;

function screens(): ScreenFixture {
  if (fixture === null) throw new Error('the screens fixture was not created');
  return fixture;
}

test.beforeAll(async ({ playwright }) => {
  fixture = await newScreenFixture(playwright, test.info().project.name);
});

test.describe('smoke', () => {
  test('the landing page shows the park and its picture', async ({ page }) => {
    await page.goto('/');
    await expectHeading(page, en.landing.heading);
    await expect(page.getByRole('img', { name: en.landing.imageAlt })).toBeVisible();
  });

  test('a resident logs in with a persona, then opens the projects list', async ({ page }) => {
    await page.goto('/login');
    await expectHeading(page, en.login.heading);
    await page.getByRole('button', { name: en.login.bcsc }).click();
    // A first sign-in goes on to the self-report questions; a later one goes to the projects.
    await expect(page).toHaveURL(/\/(self-report|projects)$/);
    await page.goto('/projects');
    await expectHeading(page, en.projects.heading);
    await expect(page.getByRole('link', { name: PARK }).first()).toBeVisible();
  });

  test('the gallery lists the live design', async ({ page }) => {
    await signIn(page, RESIDENT);
    await page.goto(`/projects/${screens().projectId}/designs`);
    await expectHeading(page, en.gallery.heading);
    await expect(page.getByRole('link', { name: /Garden loop/ })).toBeVisible();
  });

  test('the leaderboard opens with its heading', async ({ page }) => {
    await signIn(page, RESIDENT);
    await page.goto(`/projects/${screens().projectId}/leaderboard`);
    await expectHeading(page, participation.leaderboard.heading);
  });

  test('the design page shows the design, and the 3D view or the WebGL2 message', async ({
    page,
  }) => {
    await signIn(page, RESIDENT);
    await page.goto(`/designs/${screens().designId}`);
    await expectHeading(page, 'Garden loop');
    const view = page
      .getByRole('img', { name: en.editor.viewer.canvasLabel })
      .or(page.getByText(en.editor.viewer.webGlMissing));
    await expect(view).toBeVisible();
  });

  test('the vote page shows the design poster at 360 px', async ({ page }) => {
    await openVotePoster(page, screens());
    await expect(page.getByRole('button', { name: participation.vote.up })).toBeVisible();
  });
});
