import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { format, messages } from './messages';
import { createAppRouter } from './routes';
import { PATHS } from './routing/paths';
import {
  apiServer,
  createTestDeps,
  projectFixture,
  RESIDENT,
  session,
  STAFF,
  TEST_API_URL,
} from './test/api-server';
import { renderApp } from './test/render-app';

async function withProject() {
  const project = await projectFixture();
  apiServer.use(
    http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
  );
  return project;
}

describe('landing page', () => {
  it('shows the park name, one line and two actions', async () => {
    await withProject();
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Jonathan Rogers Park',
    );
    expect(
      within(main).getByText('Mount Pleasant, Vancouver. Send your design by 31 October 2026.'),
    ).toBeVisible();
    const design = within(main).getByRole('link', { name: 'Design a park' });
    const vote = within(main).getByRole('link', { name: 'Vote on designs' });
    expect(design).toHaveAttribute('data-variant', 'primary');
    expect(vote).toHaveAttribute('data-variant', 'secondary');
    expect(vote).toHaveAttribute('href', PATHS.vote('jrp'));
    expect(within(main).getByRole('img')).toHaveAccessibleName(messages.landing.imageAlt);
    expect(main).toHaveTextContent(/\d+ designs?, \d+ votes/);
  });

  it('shows the 3D render edge to edge, in two sizes, as the first image to load', async () => {
    await withProject();
    renderApp(PATHS.home);
    const hero = await screen.findByRole('img', { name: messages.landing.imageAlt });
    expect(hero).toHaveAttribute('width', '1920');
    expect(hero).toHaveAttribute('height', '1080');
    expect(hero).toHaveAttribute('fetchpriority', 'high');
    expect(hero.getAttribute('srcset')).toBe('/hero/hero-960.png 960w, /hero/hero-1920.png 1920w');
    expect(hero).toHaveAttribute('sizes', '100vw');
    const webp = hero.parentElement?.querySelector('source[type="image/webp"]');
    expect(webp?.getAttribute('srcset')).toBe(
      '/hero/hero-960.webp 960w, /hero/hero-1920.webp 1920w',
    );
    expect(hero.closest('.web-page')).toBeNull();
  });

  it('shows the attribution in the footer', async () => {
    await withProject();
    renderApp(PATHS.home);
    expect(await screen.findByRole('contentinfo')).toHaveTextContent(messages.app.attribution);
  });

  it('sets the title, description and Open Graph tags', async () => {
    await withProject();
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => {
      expect(document.title).toBe(messages.meta.landing.title);
    });
    expect(document.title).toBe(messages.meta.landing.title);
    const content = (selector: string) =>
      document.head.querySelector(selector)?.getAttribute('content');
    expect(content('meta[name="description"]')).toBe(messages.meta.landing.description);
    expect(content('meta[property="og:image"]')).toMatch(/\/og\/park\.png$/);
    expect(content('meta[property="og:image:alt"]')).toBe(messages.meta.ogImageAlt);
  });
});

describe('navigation and session', () => {
  it('offers a login link when signed out', async () => {
    await withProject();
    renderApp(PATHS.home);
    const nav = await screen.findByRole('navigation', { name: messages.app.navLabel });
    expect(within(nav).getByRole('link', { name: messages.app.navLogin })).toHaveAttribute(
      'href',
      PATHS.login,
    );
  });

  it('logs a resident out and goes home', async () => {
    await withProject();
    session.user = RESIDENT;
    const { router } = renderApp(PATHS.projects);
    const nav = await screen.findByRole('navigation', { name: messages.app.navLabel });
    await userEvent.click(await within(nav).findByRole('button', { name: messages.app.navLogout }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.home);
    });
    expect(session.user).toBeNull();
  });

  it('shows the staff link to staff', async () => {
    await withProject();
    session.user = STAFF;
    renderApp(PATHS.staff);
    const nav = await screen.findByRole('navigation', { name: messages.app.navLabel });
    expect(within(nav).getByRole('link', { name: messages.app.navStaff })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('redirects a resident away from the staff home', async () => {
    await withProject();
    session.user = RESIDENT;
    const { router } = renderApp(PATHS.staff);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
  });

  it('redirects a resident away from insights through the lazily loaded insights loader', async () => {
    await withProject();
    session.user = RESIDENT;
    const { router } = renderApp(`${PATHS.staff}/projects/jrp/insights`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
  });
});

describe('landing page after the closing day', () => {
  it('says design is closed on the landing page once the closing day has passed', async () => {
    const project = await projectFixture({ phase: 'closed' });
    apiServer.use(
      http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    );
    renderApp(PATHS.home);
    await screen.findByRole('heading', { level: 1 });
    const main = screen.getByRole('main');
    expect(within(main).getByText('Mount Pleasant, Vancouver. Design closed.')).toBeVisible();
    expect(within(main).getByRole('link', { name: 'Vote on designs' })).toHaveAttribute(
      'href',
      PATHS.projects,
    );
  });
});

describe('project pages', () => {
  it('lists projects with their design count and hides the Open badge they all share', async () => {
    await withProject();
    session.user = RESIDENT;
    renderApp(PATHS.projects);
    expect(await screen.findByRole('link', { name: 'Jonathan Rogers Park' })).toHaveAttribute(
      'href',
      PATHS.project('jrp'),
    );
    expect(await screen.findByText('1 design, closes 31 Oct')).toBeVisible();
    expect(screen.queryByText(messages.projects.status.open)).toBeNull();
    expect(document.title).toBe(messages.meta.projects.title);
  });

  it('says when no project is open', async () => {
    apiServer.use(http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [] })));
    session.user = RESIDENT;
    renderApp(PATHS.projects);
    expect(await screen.findByText(messages.projects.empty)).toBeVisible();
  });
});

describe('one project', () => {
  it('shows the design count for one project', async () => {
    await withProject();
    session.user = RESIDENT;
    renderApp(PATHS.project('jrp'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Jonathan Rogers Park',
    );
    const count = screen.getByText('1 design');
    expect(count).toBeVisible();
    // The facts and the count come first, then the brief, the park today and the buttons.
    const facts = screen.getByText(/ha park\. Mount Pleasant, Vancouver\./);
    const start = screen.getByRole('link', { name: messages.project.startDesign });
    expect(facts.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(facts.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.title).toBe(
      format(messages.meta.project.title, { name: 'Jonathan Rogers Park' }),
    );
  });

  it('offers Start a design as the one primary action', async () => {
    await withProject();
    session.user = RESIDENT;
    renderApp(PATHS.project('jrp'));
    const start = await screen.findByRole('link', { name: messages.project.startDesign });
    expect(start).toHaveAttribute('href', PATHS.newDesign('jrp'));
    expect(start).toHaveAttribute('data-variant', 'primary');
  });

  it('shows the empty state when a project has no designs', async () => {
    await withProject();
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/designs`, () => HttpResponse.json({ designs: [] })),
    );
    session.user = RESIDENT;
    renderApp(PATHS.project('jrp'));
    expect(await screen.findByText(messages.project.noDesigns)).toBeVisible();
  });

  it('shows the not found page for an unknown project', async () => {
    session.user = RESIDENT;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/nope`, () =>
        HttpResponse.json(
          { error: { kind: 'not-found', message: 'x', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    renderApp(PATHS.project('nope'));
    expect(
      await screen.findByRole('heading', { name: messages.errors.notFoundHeading }),
    ).toBeVisible();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});

describe('errors', () => {
  it('shows the not found page for an unknown path', async () => {
    renderApp('/no-such-page');
    expect(
      await screen.findByRole('heading', { name: messages.errors.notFoundHeading }),
    ).toBeVisible();
    expect(document.title).toBe(messages.meta.notFound.title);
  });

  it('shows a plain recovery page when the API is down', async () => {
    apiServer.use(http.get(`${TEST_API_URL}/me`, () => new HttpResponse('down', { status: 503 })));
    renderApp(PATHS.home);
    expect(await screen.findByRole('heading', { name: messages.errors.heading })).toBeVisible();
    expect(screen.getByRole('link', { name: messages.errors.home })).toHaveAttribute(
      'href',
      PATHS.home,
    );
  });
});

describe('error recovery', () => {
  it('offers Try again when a page fails to load, and loads it on the retry', async () => {
    await withProject();
    let fail = true;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/leaderboard`, () =>
        fail
          ? new HttpResponse('down', { status: 503 })
          : HttpResponse.json({ prior: { up: 2, down: 2 }, entries: [] }),
      ),
    );
    renderApp(PATHS.leaderboard('jrp'));
    expect(await screen.findByRole('heading', { name: messages.errors.heading })).toBeVisible();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: messages.errors.retry }));
    expect(
      await screen.findByRole('heading', { level: 1, name: messages.leaderboard.heading }),
    ).toBeVisible();
  });
});

describe('styleguide', () => {
  it('shows every ui component', async () => {
    renderApp(PATHS.styleguide);
    expect(
      await screen.findByRole('heading', { level: 1, name: messages.styleguide.heading }),
    ).toBeVisible();
    for (const heading of Object.values(messages.styleguide.sections)) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /^Log in as / })).toBeVisible();
  });

  it('captions the sample meters with the words the editor meters use', async () => {
    renderApp(PATHS.styleguide);
    await screen.findByRole('heading', { level: 1, name: messages.styleguide.heading });
    const { ok, warn, fail } = messages.editor.meters.status;
    for (const word of [ok, warn, fail]) expect(screen.getByText(word)).toBeVisible();
  });
});

describe('createAppRouter', () => {
  it('builds a browser router over the same routes', () => {
    const router = createAppRouter(createTestDeps());
    expect(router.routes.length).toBeGreaterThan(0);
    router.dispose();
  });
});

describe('project page secondary links', () => {
  it('links to voting as a secondary action and to designs and the leaderboard as text', async () => {
    await withProject();
    session.user = RESIDENT;
    renderApp(PATHS.project('jrp'));
    await screen.findByRole('link', { name: messages.project.startDesign });
    const links = [
      [messages.project.vote, PATHS.vote('jrp'), 'secondary'],
      [messages.project.gallery, PATHS.gallery('jrp'), null],
      [messages.project.leaderboard, PATHS.leaderboard('jrp'), null],
    ] as const;
    for (const [name, href, variant] of links) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link.getAttribute('data-variant')).toBe(variant);
    }
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });
});
