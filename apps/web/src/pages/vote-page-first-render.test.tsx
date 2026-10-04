import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import type { Queue } from '../api/web-api';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const THUMBNAIL = `${TEST_API_URL}/blobs/thumbnails/d1.webp`;

async function example<T>(path: string): Promise<T> {
  return (await (await fetch(`${TEST_API_URL}${path}`)).json()) as T;
}

/** A queue whose first design has a stored thumbnail, and a log of every API request. */
async function posterQueue(): Promise<string[]> {
  const project = await projectFixture();
  const queue = await example<Queue>('/projects/jrp/queue');
  const [first] = queue.designs;
  if (first === undefined) throw new Error('the example queue is empty');
  const summary = { ...first, id: 'd1', title: 'Loop park', thumbnailUrl: THUMBNAIL };
  const poster = {
    designId: 'd1',
    url: THUMBNAIL,
    width: 640,
    height: 400,
    placeholder: '#cfe3f0',
  };
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp/queue`, () =>
      HttpResponse.json({ project, designs: [summary], baselineDesignId: 'b1', poster }),
    ),
  );
  const requests: string[] = [];
  apiServer.events.on('request:start', ({ request }) => {
    requests.push(new URL(request.url).pathname);
  });
  return requests;
}

afterEach(() => {
  apiServer.events.removeAllListeners();
  document.head.querySelectorAll('link[rel="preload"]').forEach((link) => {
    link.remove();
  });
});

describe('vote page first render', () => {
  it('shows the stored poster after only the session and queue requests', async () => {
    session.user = RESIDENT;
    const requests = await posterQueue();
    renderApp(PATHS.vote('jrp'));
    const name = format(messages.vote.posterAlt, { title: 'Loop park' });
    const poster = await screen.findByRole('img', { name }, { timeout: 5000 });
    expect(poster.getAttribute('src')).toBe(THUMBNAIL);
    expect(new Set(requests)).toEqual(new Set(['/me', '/projects/jrp/queue']));
  });

  it('preloads the first poster at high priority from the route loader', async () => {
    session.user = RESIDENT;
    await posterQueue();
    renderApp(PATHS.vote('jrp'));
    const name = format(messages.vote.posterAlt, { title: 'Loop park' });
    await screen.findByRole('img', { name }, { timeout: 5000 });
    const links = document.head.querySelectorAll(`link[rel="preload"][href="${THUMBNAIL}"]`);
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('as')).toBe('image');
    expect(links[0]?.getAttribute('fetchpriority')).toBe('high');
  });
});
