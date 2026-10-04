import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '../api/web-api';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import {
  apiServer,
  projectFixture,
  RESIDENT,
  session,
  STAFF,
  TEST_API_URL,
} from '../test/api-server';
import { usePlannerHandlers } from '../test/planner-fixtures';
import { renderApp } from '../test/render-app';

import { WIZARD_STORAGE_KEY } from './wizard-state';

// MapLibre and the 3D editor need WebGL; the Playwright planner test covers them.
vi.mock('@parkshape/ui/map', () => {
  const ParcelMap = ({ strings }: { readonly strings: { readonly region: string } }) => (
    <div role="region" aria-label={strings.region} />
  );
  return { ParcelMap };
});

vi.mock('@parkshape/scene', () => {
  const ParkEditor = () => <p>stub editor</p>;
  return { ParkEditor };
});

const rendered = vi.hoisted(() => ({ frames: [] as string[] }));
vi.mock('@parkshape/scene/thumbnail', () => ({
  viewerScene: () => ({ heightmap: null, document: null, catalog: null }),
  renderThumbnail: (_input: unknown, frame: string) => {
    rendered.frames.push(frame);
    return Promise.resolve(new Blob(['RIFF'], { type: 'image/webp' }));
  },
}));

afterEach(() => {
  rendered.frames = [];
});

const { wizard, publish } = messages.planner;
const LAZY_STEP_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT = { timeout: 25_000 };

async function continueTo(step: keyof typeof wizard.steps) {
  await userEvent.click(screen.getByRole('button', { name: wizard.continue }));
  await screen.findByRole(
    'heading',
    { level: 2, name: wizard.steps[step] },
    { timeout: LAZY_STEP_TIMEOUT_MS },
  );
}

/** Answers the baseline picture upload with 500 the given number of times, then 200. */
function pictureStore(failures: number) {
  const tries: string[] = [];
  apiServer.use(
    http.post(`${TEST_API_URL}/designs/:id/thumbnail`, async ({ params }) => {
      tries.push(String(params.id));
      if (tries.length <= failures) {
        return HttpResponse.json(
          { error: { kind: 'internal', message: 'Down.', requestId: 'r1' } },
          { status: 500 },
        );
      }
      const example = (await (await fetch(`${TEST_API_URL}/designs/example`)).json()) as object;
      return HttpResponse.json(example);
    }),
  );
  return tries;
}

async function walkToPublish() {
  const { created } = usePlannerHandlers();
  session.user = STAFF;
  const app = renderApp('/staff/projects/new');
  const field = await screen.findByRole(
    'textbox',
    { name: messages.planner.site.searchLabel },
    { timeout: LAZY_STEP_TIMEOUT_MS },
  );
  await userEvent.type(field, 'Jonathan Rogers Park');
  await userEvent.click(screen.getByRole('button', { name: messages.planner.site.search }));
  await screen.findByText(format(messages.planner.site.found, { name: 'Jonathan Rogers Park' }));
  await continueTo('terrain');
  await screen.findByTestId('terrain-source');
  await continueTo('review');
  await screen.findByRole('table');
  await continueTo('parameters');
  await continueTo('refine');
  await continueTo('publish');
  return { ...app, created };
}

describe('publishing a project', () => {
  it(
    'publishes once and draws once when Publish is pressed twice in a row',
    TEST_TIMEOUT,
    async () => {
      const pictures = pictureStore(0);
      const { router, created } = await walkToPublish();
      const button = screen.getByRole('button', { name: publish.publish });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe(PATHS.staff);
      });
      expect(created).toHaveLength(1);
      expect(rendered.frames).toEqual(['baseline']);
      expect(pictures).toHaveLength(1);
    },
  );

  it(
    'keeps the project open when its picture fails, and retries only the picture',
    TEST_TIMEOUT,
    async () => {
      const pictures = pictureStore(1);
      const { router, created } = await walkToPublish();
      await userEvent.click(screen.getByRole('button', { name: publish.publish }));
      // The stub POST /projects answers with the generated example project, named "example".
      const title = format(publish.pictureFailed, { name: 'example' });
      expect(await screen.findByText(title)).toBeVisible();
      expect(router.state.location.pathname).not.toBe(PATHS.staff);
      await userEvent.click(screen.getByRole('button', { name: publish.pictureRetry }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe(PATHS.staff);
      });
      expect(created).toHaveLength(1);
      expect(pictures).toHaveLength(2);
      expect(window.sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    },
  );
});

describe('publishing a project again', () => {
  it(
    'treats a second Publish after the picture failed as the same open project',
    TEST_TIMEOUT,
    async () => {
      pictureStore(1);
      const { created } = await walkToPublish();
      await userEvent.click(screen.getByRole('button', { name: publish.publish }));
      await screen.findByRole('button', { name: publish.pictureRetry });
      await userEvent.click(screen.getByRole('button', { name: publish.publish }));
      await waitFor(() => {
        expect(rendered.frames).toHaveLength(2);
      });
      expect(created).toHaveLength(1);
    },
  );

  it('finishes without a picture when the planner chooses to', TEST_TIMEOUT, async () => {
    const pictures = pictureStore(1);
    const { router, created } = await walkToPublish();
    await userEvent.click(screen.getByRole('button', { name: publish.publish }));
    await userEvent.click(await screen.findByRole('button', { name: publish.skipPicture }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.staff);
    });
    expect(created).toHaveLength(1);
    expect(pictures).toHaveLength(1);
    expect(window.sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
  });
});

describe('an abandoned wizard', () => {
  it(
    'sends nothing to the server, so residents see only published projects',
    TEST_TIMEOUT,
    async () => {
      const open: Project = await projectFixture();
      const { router, created } = await walkToPublish();
      apiServer.use(
        http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [open] })),
      );
      session.user = RESIDENT;
      await router.navigate(PATHS.projects);
      expect(await screen.findByRole('link', { name: new RegExp(open.name) })).toBeVisible();
      expect(created).toEqual([]);
      expect(window.sessionStorage.getItem(WIZARD_STORAGE_KEY)).not.toBeNull();
      expect(screen.queryByText(publish.publish)).toBeNull();
    },
  );
});
