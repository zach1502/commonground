import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { VOTE_PRELOAD_MARKER } from './build/vote-preload';
import { EARLY_QUEUE_KEY } from './routing/early-queue';

// jsdom gives import.meta.url a non-file scheme, so the path comes from the module's folder.
const INDEX_HTML = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const API = 'http://api.test';
const OK = 200;
const UNAUTHORIZED = 401;
const PLAN = { chunks: ['/assets/vote-page-c.js', '/assets/intent-d.js'], queueSize: 5 };

/** The classic inline script, with the values the build and Vite fill in. */
function bootScript(plan: object | null): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML);
  const script = match?.[1] ?? '';
  expect(script).toContain(VOTE_PRELOAD_MARKER);
  return script
    .replace(VOTE_PRELOAD_MARKER, JSON.stringify(plan))
    .replaceAll('%VITE_API_URL%', API);
}

const POSTER_URL = `${API}/blobs/thumbnails/d1.webp`;
const FONT_PRELOADS = ['bold', 'regular'].map((weight) => ({
  href: `/fonts/bc-sans-${weight}-latin.woff2`,
  as: 'font',
  crossorigin: 'anonymous',
}));

function queueResponse(status: number): Response {
  const body = { designs: [], poster: { url: POSTER_URL } };
  return new Response(JSON.stringify(body), { status });
}

function runAt(pathname: string, plan: object | null = PLAN, status = OK) {
  const loadListeners: (() => void)[] = [];
  const scope: Record<string, unknown> = {};
  const fetch = vi.fn(() => Promise.resolve(queueResponse(status)));
  runInNewContext(bootScript(plan), {
    document,
    window: scope,
    fetch,
    location: { pathname },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'load') loadListeners.push(listener);
    },
  });
  return {
    scope,
    fetch,
    fireLoad: () => {
      loadListeners.forEach((listener) => {
        listener();
      });
    },
  };
}

const links = (rel: string) =>
  [...document.head.querySelectorAll(`link[rel="${rel}"]`)].map((link) => ({
    href: link.getAttribute('href'),
    as: link.getAttribute('as'),
    crossorigin: link.getAttribute('crossorigin'),
  }));

afterEach(() => {
  document.head.replaceChildren();
});

describe('index.html', () => {
  it('opens the API connection early, with credentials, before the loaders ask for it', () => {
    expect(INDEX_HTML).toMatch(
      /<link\s+rel="preconnect"\s+href="%VITE_API_URL%"\s+crossorigin="use-credentials"\s*\/>/,
    );
  });

  it('declares an empty icon, so no page loses a request to a missing /favicon.ico', () => {
    expect(INDEX_HTML).toContain('<link rel="icon" href="data:," />');
  });

  it('preloads the two BC Sans subsets on every page but the vote page', () => {
    expect(INDEX_HTML).not.toMatch(/<link[^>]+as="font"/);
    for (const plan of [PLAN, null]) {
      runAt('/projects/p1/designs', plan);
      expect(links('preload')).toEqual(FONT_PRELOADS);
      document.head.replaceChildren();
    }
  });
});

describe('index.html on the vote URL', () => {
  it('on the vote URL, leaves the fonts to the stylesheet so the vote modules get the connections', async () => {
    const page = runAt('/projects/p1/vote');
    await (page.scope[EARLY_QUEUE_KEY] as { queue: Promise<unknown> }).queue;
    await vi.waitFor(() => {
      expect(links('preload').map(({ as }) => as)).toEqual(['fetch', 'image']);
    });
  });

  it('on the vote URL, starts the vote modules, the session and the queue with the HTML', () => {
    const page = runAt('/projects/p1/vote');
    expect(links('modulepreload').map(({ href }) => href)).toEqual(PLAN.chunks);
    expect(links('preload')).toEqual([
      { href: `${API}/me`, as: 'fetch', crossorigin: 'use-credentials' },
    ]);
    expect(page.fetch).toHaveBeenCalledWith(`${API}/projects/p1/queue?n=5`, {
      credentials: 'include',
    });
  });

  it('hands the queue to the vote loader and preloads its first poster', async () => {
    const page = runAt('/projects/p1/vote');
    const early = page.scope[EARLY_QUEUE_KEY] as { projectId: string; queue: Promise<unknown> };
    expect(early.projectId).toBe('p1');
    expect(await early.queue).toMatchObject({ poster: { url: POSTER_URL } });
    await vi.waitFor(() => {
      expect(links('preload')).toContainEqual({ href: POSTER_URL, as: 'image', crossorigin: null });
    });
    const poster = document.head.querySelector('link[as="image"]');
    expect(poster?.getAttribute('fetchpriority')).toBe('high');
  });

  it('hands over null when the queue request fails, so the loader asks again', async () => {
    const page = runAt('/projects/p1/vote', PLAN, UNAUTHORIZED);
    const early = page.scope[EARLY_QUEUE_KEY] as { queue: Promise<unknown> };
    expect(await early.queue).toBeNull();
    expect(links('preload')).toHaveLength(1);
  });
});

describe('index.html on other pages', () => {
  it('on the landing and project pages, prefetches the vote modules after load', () => {
    for (const pathname of ['/', '/projects/p1']) {
      const page = runAt(pathname);
      expect(links('prefetch')).toEqual([]);
      page.fireLoad();
      expect(links('prefetch').map(({ href }) => href)).toEqual(PLAN.chunks);
      document.head.replaceChildren();
    }
  });

  it('adds no module links on other pages or in dev, where the build left no plan', () => {
    runAt('/projects/p1/designs').fireLoad();
    runAt('/projects/p1/vote', null).fireLoad();
    expect(document.head.querySelectorAll('link:not([as="font"])')).toHaveLength(0);
  });
});
