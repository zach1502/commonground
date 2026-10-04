import {
  expect,
  type APIRequestContext,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';

import participation from '../src/locales/en.participation.json' with { type: 'json' };

import { RESIDENT, signIn } from './app-routes.ts';
import { createOwnProject, seedLiveDesign } from './own-project.ts';

/** The project and live design the screens below open, made once per worker. */
export interface ScreenFixture {
  readonly projectId: string;
  readonly designId: string;
}

// A resident other than the voter, so the voter's queue shows the design. Each browser project
// seeds through a rotation of residents: the API allows 10 submissions an hour for each, and the
// full chromium run seeds more than one persona could carry, so the fixtures spread the load.
const SEEDER_POOL = [
  'persona-rose-evergreen',
  'persona-gail-marigold',
  'persona-kevin-kickabout',
  'persona-bob-walksadog',
  'persona-sally-smoothpath',
] as const;
const seederUseByBrowser = new Map<string, number>();

function nextSeeder(browserProject: string): string {
  const used = seederUseByBrowser.get(browserProject) ?? 0;
  seederUseByBrowser.set(browserProject, used + 1);
  return SEEDER_POOL[used % SEEDER_POOL.length] ?? SEEDER_POOL[0];
}

// The screen fixture project stays open with a closing date.
const SCREEN_CLOSES_AT = '2099-12-31';
const DESIGN_TITLE = 'Garden loop';
const PHONE = { width: 360, height: 740 } as const;

const projectPath = (fixture: ScreenFixture, tail: string) =>
  `/projects/${encodeURIComponent(fixture.projectId)}${tail}`;

/** A project of its own with one live design, seeded as the browser project's resident. */
export async function createScreenFixture(
  request: APIRequestContext,
  browserProject: string,
): Promise<ScreenFixture> {
  const projectId = await createOwnProject(request, 'screens-check', {
    closesAt: SCREEN_CLOSES_AT,
  });
  const seeder = nextSeeder(browserProject);
  const designId = await seedLiveDesign(request, projectId, seeder);
  return { projectId, designId };
}

/** The same fixture from a request context of its own, for a beforeAll hook. */
export async function newScreenFixture(
  playwright: PlaywrightWorkerArgs['playwright'],
  browserProject: string,
): Promise<ScreenFixture> {
  const request = await playwright.request.newContext();
  const fixture = await createScreenFixture(request, browserProject);
  await request.dispose();
  return fixture;
}

/** Opens the vote page at phone width and waits for the poster of the seeded design. */
export async function openVotePoster(page: Page, fixture: ScreenFixture) {
  await page.setViewportSize(PHONE);
  await signIn(page, RESIDENT);
  await page.goto(projectPath(fixture, '/vote'));
  const alt = participation.vote.posterAlt.replace('{title}', DESIGN_TITLE);
  await expect(page.getByRole('img', { name: alt })).toBeVisible();
}
