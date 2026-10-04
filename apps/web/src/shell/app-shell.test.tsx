import { act, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_MS } from '@parkshape/ui';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

import { AppShell, BARE_CHROME, ROOT_ROUTE_ID } from './app-shell';

async function withProject() {
  const project = await projectFixture();
  apiServer.use(
    http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
  );
}

describe('footer', () => {
  it('folds the full attribution on the landing page with no credit line outside it', async () => {
    await withProject();
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    const footer = screen.getByRole('contentinfo');
    const details = footer.querySelector('details');
    expect(details).not.toHaveAttribute('open');
    expect(details?.querySelector('summary')).toHaveTextContent(messages.app.sourcesLink);
    expect(details).toHaveTextContent(messages.app.attribution);
    expect(footer.querySelectorAll('p')).toHaveLength(0);
  });

  it('carries no link groups and no copyright line', async () => {
    await withProject();
    session.user = RESIDENT;
    renderApp(PATHS.projects);
    await screen.findByRole('heading', { level: 1 });
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryAllByRole('navigation')).toHaveLength(0);
    expect(within(footer).queryAllByRole('link')).toHaveLength(0);
    expect(footer).not.toHaveTextContent('\u00a9');
  });

  it('keeps the TransLink legend, word for word, inside the folded sources', async () => {
    await withProject();
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    const details = screen.getByRole('contentinfo').querySelector('details');
    expect(details).toHaveTextContent(
      'Route and arrival data used in this product or service is provided by permission of TransLink. TransLink assumes no responsibility for the accuracy or currency of the Data used in this product or service.',
    );
  });

  it('leaves the footer off a bare page, so the editor is the whole window', async () => {
    const router = createMemoryRouter(
      [
        {
          id: ROOT_ROUTE_ID,
          path: '/',
          loader: () => ({ user: null }),
          Component: AppShell,
          children: [{ path: 'bare', handle: BARE_CHROME, element: <h1>Editor</h1> }],
        },
      ],
      { initialEntries: ['/bare'] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1, name: 'Editor' });
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });
});

describe('header', () => {
  it('shows DEMO beside the service name', async () => {
    await withProject();
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    const banner = screen.getByRole('banner');
    expect(messages.app.demoStatus).toBe('DEMO');
    expect(within(banner).getByText(messages.app.demoStatus)).toHaveClass('bcds-header--status');
    expect(banner).toHaveTextContent(messages.app.name);
  });

  it('links the CommonGround wordmark home and draws no logo artwork', async () => {
    await withProject();
    renderApp(PATHS.projects);
    await screen.findByRole('heading', { level: 1 });
    const banner = screen.getByRole('banner');
    const home = within(banner).getByRole('link', { name: messages.app.name });
    expect(home).toHaveAttribute('href', PATHS.home);
    expect(banner.querySelector('svg')).toBeNull();
    expect(banner).not.toHaveTextContent(/British Columbia|Government of|B\.C\./i);
  });
});

// Twice the 1 s skeleton delay, so a busy test worker still sees the grey blocks.
const SKELETON_WAIT_MS = 2000;

describe('skeleton to content (J13)', () => {
  let faded: Element[] = [];

  beforeEach(() => {
    faded = [];
    Element.prototype.animate = function animate(this: Element, _keyframes, options) {
      if ((options as KeyframeAnimationOptions).duration === MOTION_MS.small) faded.push(this);
      return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it('fades the page in over the skeleton slot once a wait over 1 s ends', async () => {
    await withProject();
    session.user = RESIDENT;
    const { router } = renderApp(PATHS.projects);
    await screen.findByRole('heading', { level: 1 });
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/designs`, async () => {
        await held;
        return HttpResponse.json({ designs: [] });
      }),
    );
    act(() => {
      void router.navigate(PATHS.gallery('jrp'));
    });
    await vi.waitFor(
      () => {
        expect(document.querySelector('.ps-skeleton__block--card')).not.toBeNull();
      },
      { timeout: SKELETON_WAIT_MS },
    );
    const outlet = document.querySelector('.web-outlet');
    expect(outlet).not.toBeVisible();
    release?.();
    await screen.findByText(messages.gallery.empty);
    // The page renders under the skeleton one commit before the slot opens, so wait for the slot.
    await vi.waitFor(() => {
      expect(outlet).toBeVisible();
    });
    expect(faded).toContain(outlet);
  });
});
