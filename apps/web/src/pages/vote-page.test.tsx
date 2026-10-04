import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Design, Queue } from '../api/web-api';
import { createVisitStore } from '../features/leaderboard/visit-ranks';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const DOCUMENT = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

async function example<T>(path: string): Promise<T> {
  return (await (await fetch(`${TEST_API_URL}${path}`)).json()) as T;
}

/** A queue of one design with no thumbnail, and a count of the requests for it. */
async function oneDesignQueue() {
  const project = await projectFixture();
  const queue = await example<Queue>('/projects/jrp/queue');
  const design = await example<Design>('/designs/d1');
  const [first] = queue.designs;
  if (first === undefined) throw new Error('the example queue is empty');
  const summary = { ...first, id: 'd1', title: 'Loop park', thumbnailUrl: null };
  const full = { ...design, ...summary, document: DOCUMENT };
  const requests = { design: 0 };
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp/queue`, () =>
      HttpResponse.json({ project, designs: [summary], baselineDesignId: null, poster: null }),
    ),
    http.get(`${TEST_API_URL}/designs/d1`, () => {
      requests.design += 1;
      return HttpResponse.json(full);
    }),
  );
  return requests;
}

describe('vote page', () => {
  it('shows the first design as a flat plan, fetched once by the route loader', async () => {
    session.user = RESIDENT;
    const requests = await oneDesignQueue();
    renderApp(PATHS.vote('jrp'));
    const name = format(messages.vote.posterAlt, { title: 'Loop park' });
    const poster = await screen.findByRole('img', { name }, { timeout: 5000 });
    expect(poster.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByRole('button', { name: messages.vote.up })).toBeInTheDocument();
    expect(requests.design).toBe(1);
  });

  it('shows the closed state on a closed project with no designs', async () => {
    session.user = RESIDENT;
    const project = await projectFixture({ phase: 'closed' });
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/queue`, () =>
        HttpResponse.json({ project, designs: [], baselineDesignId: null, poster: null }),
      ),
    );
    renderApp(PATHS.vote('jrp'));
    expect(await screen.findByText(messages.vote.closed)).toBeInTheDocument();
    expect(screen.queryByText(messages.vote.empty)).toBeNull();
    expect(screen.getByRole('link', { name: messages.vote.seeLeaderboard })).toBeInTheDocument();
  });

  it('sets the voted flag beside the leaderboard ranks once a vote is recorded (J9)', async () => {
    session.user = RESIDENT;
    await oneDesignQueue();
    renderApp(PATHS.vote('jrp'));
    await userEvent.click(
      await screen.findByRole('button', { name: messages.vote.up }, { timeout: 5000 }),
    );
    await waitFor(() => {
      expect(createVisitStore(window.sessionStorage).read('jrp')?.votedSinceLastVisit).toBe(true);
    });
  });
});

describe('vote page first paint', () => {
  it('loads the leaderboard visit store only once a vote is recorded, so it adds no request before the poster', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'vote-page.tsx'), 'utf8');
    expect(source).not.toMatch(/^import [^;]*visit-ranks'/m);
    expect(source).toContain("import('../features/leaderboard/visit-ranks')");
  });
});
