import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_MS } from '@parkshape/ui';

import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const render = () => {
  renderApp(PATHS.gallery('jrp'));
  return { container: document.body };
};

beforeEach(async () => {
  const project = await projectFixture();
  apiServer.use(http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)));
});

function listWith(designs: unknown[]) {
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp/designs`, () => HttpResponse.json({ designs })),
  );
}

describe('gallery page', () => {
  it('shows the empty state with a link to start a design', async () => {
    listWith([]);
    renderApp(PATHS.gallery('jrp'));
    expect(await screen.findByText(messages.gallery.empty)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.gallery.emptyAction })).toHaveAttribute(
      'href',
      PATHS.newDesign('jrp'),
    );
  });

  it('keeps the heading short, with the park name as a plain line above', async () => {
    listWith([]);
    renderApp(PATHS.gallery('jrp'));
    expect(
      await screen.findByRole('heading', { level: 1, name: messages.gallery.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText('Jonathan Rogers Park')).toHaveClass('ps-page-title__context');
  });

  it('shows a card with the title and a metric badge', async () => {
    listWith([
      {
        id: 'd1',
        projectId: 'jrp',
        title: 'Shady loop',
        blurb: '',
        status: 'submitted',
        metrics: null,
        forkedFrom: null,
        versionOf: null,
        thumbnailRef: 'thumbnails/d1.png',
        thumbnailUrl: `${TEST_API_URL}/blobs/thumbnails/d1.png`,
        badges: [{ key: 'budget', message: 'A little over.', badge: 'Over budget 12%' }],
        up: 0,
        down: 0,
        createdAt: '2026-09-25T09:00:00.000Z',
        submittedAt: '2026-09-25T09:05:00.000Z',
        author: null,
      },
    ]);
    renderApp(PATHS.gallery('jrp'));
    expect(
      await screen.findByRole('heading', { name: 'Shady loop', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Over budget 12%')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: format(messages.gallery.cardLabel, { title: 'Shady loop' }),
      }),
    ).toBeInTheDocument();
  });
});

describe('gallery page pictures', () => {
  it('keeps the picture space with a plain block when a design has no thumbnail', async () => {
    listWith([
      {
        id: 'd2',
        projectId: 'jrp',
        title: 'Open lawn',
        blurb: '',
        status: 'submitted',
        metrics: null,
        forkedFrom: null,
        versionOf: null,
        thumbnailRef: null,
        thumbnailUrl: null,
        badges: [],
        up: 0,
        down: 0,
        createdAt: '2026-09-25T09:00:00.000Z',
        submittedAt: '2026-09-25T09:05:00.000Z',
        author: null,
      },
    ]);
    const { container } = render();
    expect(await screen.findByRole('heading', { name: 'Open lawn', level: 2 })).toBeInTheDocument();
    expect(container.querySelector('.web-gallery__thumb--none')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

function designRow(id: string, metrics: unknown = null) {
  return {
    id,
    projectId: 'jrp',
    title: `Design ${id}`,
    blurb: '',
    status: 'submitted',
    metrics,
    forkedFrom: null,
    versionOf: null,
    thumbnailRef: null,
    thumbnailUrl: null,
    badges: [],
    up: 7,
    down: 3,
    createdAt: '2026-09-25T09:00:00.000Z',
    submittedAt: '2026-09-25T09:05:00.000Z',
    author: null,
  };
}

describe('gallery page closed project', () => {
  it('shows the closed state and hides the design action', async () => {
    const closed = await projectFixture({ phase: 'closed' });
    apiServer.use(http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(closed)));
    listWith([]);
    renderApp(PATHS.gallery('jrp'));
    expect(await screen.findByText(messages.gallery.closed)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: messages.gallery.emptyAction })).toBeNull();
    expect(screen.getByRole('link', { name: messages.leaderboard.heading })).toHaveAttribute(
      'href',
      PATHS.leaderboard('jrp'),
    );
  });
});

describe('gallery page facts and actions', () => {
  it('puts one fact line under each title, with no vote counts', async () => {
    const totals = { canopyPercent: 18.2, gardenPlots: 105, costCad: 310000 };
    listWith([designRow('a', { totals })]);
    renderApp(PATHS.gallery('jrp'));
    const card = (await screen.findByRole('heading', { name: 'Design a', level: 2 })).closest('li');
    expect(card).toHaveTextContent('Tree canopy 18%, cost $310,000');
    expect(card).not.toHaveTextContent('plots');
    expect(card).not.toHaveTextContent('7');
  });

  it('shows Vote on designs at the top and a second link to vote at the end', async () => {
    listWith([designRow('a'), designRow('b')]);
    renderApp(PATHS.gallery('jrp'));
    const votes = await screen.findAllByRole('link', { name: messages.gallery.vote });
    expect(votes).toHaveLength(2);
    votes.forEach((link) => {
      expect(link).toHaveAttribute('href', PATHS.vote('jrp'));
    });
    expect(votes[0]).toHaveClass('primary');
    expect(votes[1]).toHaveClass('secondary');
  });
});

describe('gallery page reveal (J6)', () => {
  interface Played {
    readonly target: Element;
    readonly options: KeyframeAnimationOptions;
  }
  let played: Played[] = [];

  beforeEach(() => {
    played = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    Element.prototype.animate = function animate(this: Element, _keyframes, options) {
      played.push({ target: this, options: options as KeyframeAnimationOptions });
      return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it('fades the whole card list in once, with no animation or delay on any card', async () => {
    listWith([designRow('a'), designRow('b'), designRow('c')]);
    renderApp(PATHS.gallery('jrp'));
    await screen.findByRole('heading', { name: 'Design c', level: 2 });
    const grid = document.querySelector('.web-gallery__grid');
    expect(played.map((call) => call.target)).toEqual([grid]);
    expect(played[0]?.options).toMatchObject({ duration: MOTION_MS.small, delay: 0 });
    // No fill holds a frame once the fade ends, so the grid shows the cards it now holds.
    expect(played[0]?.options.fill).toBeUndefined();
    expect(grid).toHaveTextContent('Design c');
    expect(played.some((call) => call.target.tagName === 'LI')).toBe(false);
  });

  it('fades nothing under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    listWith([designRow('a')]);
    renderApp(PATHS.gallery('jrp'));
    await screen.findByRole('heading', { name: 'Design a', level: 2 });
    expect(played).toHaveLength(0);
  });
});
