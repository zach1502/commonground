import { http, HttpResponse } from 'msw';

import type { DesignDocument } from '@parkshape/core';

import type { Design } from '../api/web-api';

import { TEST_API_URL } from './api-server';

type Link = 'online' | 'offline';

interface SaveRequest {
  readonly title: string;
  readonly blurb: string;
  readonly document: Design['document'];
  readonly expectedUpdatedAt?: string;
}

/** The stamp after `stamp`: 1 ms later, as the API moves it when its clock has not moved. */
function after(stamp: string): string {
  return new Date(Date.parse(stamp) + 1).toISOString();
}

/** The API's 409 body for a stale stamp. */
function conflict(current: Design) {
  return HttpResponse.json(
    {
      code: 'draftChanged',
      error: { kind: 'draftChanged', message: 'Saved elsewhere.', requestId: 'r-409' },
      current,
    },
    { status: 409 },
  );
}

/**
 * One draft behind MSW with the API's conditional save: a PUT whose expectedUpdatedAt no longer
 * matches gets 409 draftChanged with the stored draft. The server never reads a clock, so a test
 * can set the browser clock to any time.
 */
export function createDraftServer(initial: Design) {
  let stored = initial;
  let link: Link = 'online';
  let gate: Promise<void> | null = null;
  let waiting = 0;
  const puts: SaveRequest[] = [];
  const store = (body: Omit<SaveRequest, 'expectedUpdatedAt'>) => {
    stored = { ...stored, ...body, updatedAt: after(stored.updatedAt) };
    return stored;
  };
  const handlers = [
    http.get(`${TEST_API_URL}/designs/${initial.id}`, () => HttpResponse.json(stored)),
    http.put(`${TEST_API_URL}/designs/${initial.id}`, async ({ request }) => {
      if (link === 'offline') return HttpResponse.error();
      const body = (await request.json()) as SaveRequest;
      if (gate !== null) {
        waiting += 1;
        await gate;
      }
      puts.push(body);
      const { expectedUpdatedAt, ...changes } = body;
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== stored.updatedAt) {
        return conflict(stored);
      }
      return HttpResponse.json(store(changes));
    }),
  ];
  return {
    handlers,
    puts,
    stored: () => stored,
    /** Another tab or device saves this draft, straight to the server. */
    saveFromOtherTab(document: DesignDocument): Design {
      // The generated document type differs from the core one only in polygon tuple length.
      const sent = document as unknown as Design['document'];
      return store({ title: stored.title, blurb: stored.blurb, document: sent });
    },
    setLink(next: Link) {
      link = next;
    },
    /** Holds every PUT until the returned release runs, like a slow link. */
    hold(): () => void {
      let release: () => void = () => undefined;
      gate = new Promise((done) => {
        release = done;
      });
      return () => {
        gate = null;
        release();
      };
    },
    /** How many PUTs have waited on a hold. */
    held: () => waiting,
  };
}
