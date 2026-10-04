import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ApiRequestError, createApiClient } from './client.js';
import { createApiHandlers } from './generated/msw.js';

const BASE_URL = 'http://api.test';
const server = setupServer(...Object.values(createApiHandlers(BASE_URL)));

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const client = createApiClient({ baseUrl: BASE_URL });

describe('createApiClient', () => {
  it('returns the typed body for a GET', async () => {
    const health = await client.request('get', '/health');
    expect(health).toEqual({ ok: true });
  });

  it('fills path parameters and query strings', async () => {
    let seen = '';
    server.use(
      http.get(`${BASE_URL}/projects/:id/queue`, ({ request }) => {
        seen = request.url;
        return HttpResponse.json({ designs: [] });
      }),
    );
    const queue = await client.request('get', '/projects/{id}/queue', {
      path: { id: 'park 1' },
      query: { n: 3 },
    });
    expect(queue.designs).toEqual([]);
    expect(seen).toBe(`${BASE_URL}/projects/park%201/queue?n=3`);
  });

  it('sends JSON bodies with cookies included', async () => {
    let received: unknown;
    let credentials = '';
    server.use(
      http.post(`${BASE_URL}/auth/login`, async ({ request }) => {
        received = await request.json();
        credentials = request.credentials;
        return HttpResponse.json({ user: { id: 'u', role: 'resident', displayName: 'U' } });
      }),
    );
    const me = await client.request('post', '/auth/login', { body: { persona: 'u' } });
    expect(me.user.id).toBe('u');
    expect(received).toEqual({ persona: 'u' });
    expect(credentials).toBe('include');
  });

  it('returns undefined for a 204', async () => {
    await expect(client.request('post', '/auth/logout')).resolves.toBeUndefined();
  });
});

describe('createApiClient errors and handlers', () => {
  it('throws an ApiRequestError carrying the error kind and status', async () => {
    server.use(
      http.post(`${BASE_URL}/votes`, () =>
        HttpResponse.json(
          { error: { kind: 'rate-limited', message: 'Slow down.', requestId: 'r1' } },
          { status: 429 },
        ),
      ),
    );
    const attempt = client.request('post', '/votes', {
      body: { designId: 'd1', value: 1, reasons: [] },
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError);
    await expect(attempt).rejects.toMatchObject({ status: 429, kind: 'rate-limited' });
  });

  it('reports an unknown error kind when the body is not an error body', async () => {
    server.use(http.get(`${BASE_URL}/me`, () => new HttpResponse('boom', { status: 502 })));
    await expect(client.request('get', '/me')).rejects.toMatchObject({
      status: 502,
      kind: 'unknown',
    });
  });

  it('answers every operation from the generated handlers', async () => {
    const handlers = Object.values(createApiHandlers(BASE_URL));
    expect(Object.keys(createApiHandlers(BASE_URL))).toContain('getLeaderboard');
    for (const handler of handlers) {
      const { method, path } = handler.info as { method: string; path: string };
      const response = await fetch(path.replace(/:\w+/g, 'x'), { method });
      expect(response.ok, `${method} ${path}`).toBe(true);
    }
  });
});

describe('createApiClient error bodies', () => {
  it('keeps the parsed error body, so a 409 can carry the stored draft', async () => {
    const current = { id: 'd1', updatedAt: '2026-09-26T22:20:00.001Z' };
    server.use(
      http.put(`${BASE_URL}/designs/:id`, () =>
        HttpResponse.json(
          {
            code: 'draftChanged',
            error: { kind: 'draftChanged', message: 'Saved elsewhere.', requestId: 'r1' },
            current,
          },
          { status: 409 },
        ),
      ),
    );
    const body = { title: 't', blurb: '', document: {}, expectedUpdatedAt: current.updatedAt };
    const attempt = client.request('put', '/designs/{id}', {
      path: { id: 'd1' },
      body: body as never,
    });
    await expect(attempt).rejects.toMatchObject({
      status: 409,
      kind: 'draftChanged',
      body: { code: 'draftChanged', current },
    });
  });
});
