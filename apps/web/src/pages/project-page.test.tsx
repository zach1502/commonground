import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Project } from '../api/web-api';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const BRIEF = 'Add shade near the play area. Keep the community garden.';

async function openProject(overrides: Partial<Project> = {}) {
  const base = await projectFixture();
  const project = { ...base, ...overrides };
  apiServer.use(http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)));
  session.user = RESIDENT;
  renderApp(PATHS.project('jrp'));
  await screen.findByRole('heading', { level: 1 });
  return project;
}

describe('project page brief', () => {
  it('shows the staff brief under the facts line, under its own label', async () => {
    const base = await projectFixture();
    await openProject({ parameters: { ...base.parameters, brief: BRIEF } });
    const brief = screen.getByRole('region', { name: messages.project.brief });
    expect(within(brief).getByRole('heading', { level: 2 })).toHaveTextContent(
      messages.project.brief,
    );
    expect(within(brief).getByText(BRIEF)).toBeVisible();
    const facts = screen.getByText(/ha park\./);
    expect(facts.compareDocumentPosition(brief) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the brief out when staff left it empty', async () => {
    const base = await projectFixture();
    await openProject({ parameters: { ...base.parameters, brief: '  ' } });
    expect(screen.queryByRole('region', { name: messages.project.brief })).toBeNull();
  });
});

function baselineWith(thumbnailUrl: string | null, document: unknown = null) {
  apiServer.use(
    http.get(`${TEST_API_URL}/designs/base`, () =>
      HttpResponse.json({ id: 'base', title: 'Today', thumbnailUrl, document }),
    ),
  );
}

const EMPTY_PLAN = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

describe('project page order', () => {
  it('reads facts, the brief, the park today, then 2 buttons with Start a design filled', async () => {
    const base = await projectFixture();
    baselineWith(`${TEST_API_URL}/blobs/thumbnails/base.png`);
    await openProject({
      phase: 'open',
      baselineDesignId: 'base',
      parameters: { ...base.parameters, brief: BRIEF },
    });
    const facts = screen.getByText(/ha park\./);
    const brief = screen.getByRole('heading', { level: 2, name: messages.project.brief });
    const picture = await screen.findByRole('img', {
      name: format(messages.project.baselineAlt, { name: 'Jonathan Rogers Park' }),
    });
    expect(picture).toHaveAttribute('src', `${TEST_API_URL}/blobs/thumbnails/base.png`);
    const start = screen.getByRole('link', { name: messages.project.startDesign });
    const vote = screen.getByRole('link', { name: messages.project.vote });
    const order = [facts, brief, picture, start, vote];
    order.slice(1).forEach((node, index) => {
      const before = order[index] ?? node;
      expect(before.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(start).toHaveClass('primary');
    expect(vote).toHaveClass('secondary');
    expect(document.querySelectorAll('.primary')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${TEST_API_URL}/blobs/thumbnails/base.png`,
    );
  });
});

describe('project page links and pictures', () => {
  it('turns the gallery and leaderboard into text links in the fact line', async () => {
    await openProject();
    const gallery = screen.getByRole('link', { name: messages.project.gallery });
    const board = screen.getByRole('link', { name: messages.project.leaderboard });
    expect(gallery).toHaveAttribute('href', PATHS.gallery('jrp'));
    expect(board).toHaveAttribute('href', PATHS.leaderboard('jrp'));
    for (const link of [gallery, board]) {
      expect(link).not.toHaveClass('secondary');
      expect(link.closest('.web-project__facts')).not.toBeNull();
    }
  });

  it('leaves the picture out when the project has no baseline', async () => {
    await openProject({ baselineDesignId: null });
    expect(screen.getByRole('link', { name: messages.project.vote })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('leaves the picture out when the baseline has no thumbnail and no plan to draw', async () => {
    baselineWith(null);
    await openProject({ baselineDesignId: 'base' });
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('draws the park today as a flat plan when the baseline has no thumbnail', async () => {
    baselineWith(null, EMPTY_PLAN);
    await openProject({ baselineDesignId: 'base' });
    const picture = await screen.findByRole('img', {
      name: format(messages.project.baselineAlt, { name: 'Jonathan Rogers Park' }),
    });
    expect(picture.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });
});
