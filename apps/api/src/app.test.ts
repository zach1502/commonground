import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';

import { HEALTH_PATH, createApp, createInMemoryDeps, openApiDocument } from './index.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

const app = () =>
  createApp(createInMemoryDeps(loadConfig({}), { clock: new FakeClock(new Date(0)) }));

describe('createApp', () => {
  it('answers GET /health with ok', async () => {
    const response = await app().request(HEALTH_PATH);
    expect(response.status).toBe(HTTP_OK);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app().request('/missing');
    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it('logs a 500 through the Logger port with no query parameters', async () => {
    const lines: string[] = [];
    // The fixed rules start with no note about AI_API_KEY, so the 500 is the only line.
    const deps = createInMemoryDeps(loadConfig({ AI_PROVIDER: 'rule-based' }), {
      clock: new FakeClock(new Date(0)),
      logger: { warn: (line) => lines.push(line) },
    });
    const query = Object.assign(
      new Error('Failed query: select 1 where email = $1\nparams: a@b.c'),
      {
        name: 'DrizzleQueryError',
        cause: Object.assign(new Error('relation "users" does not exist'), { code: '42P01' }),
      },
    );
    deps.repos.projects.list = () => Promise.reject(query);
    const response = await createApp(deps).request('/projects');
    expect(response.status).toBe(HTTP_INTERNAL_ERROR);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^request \S+ failed: DrizzleQueryError: Failed query: select 1/);
    expect(lines[0]).toContain('42P01');
    expect(lines[0]).not.toContain('a@b.c');
  });

  it('describes every route with an operation id in the OpenAPI document', () => {
    const document = openApiDocument(app());
    const operations = Object.values(document.paths ?? {}).flatMap((item) =>
      Object.values(item as Record<string, { operationId?: string }>),
    );
    expect(operations.length).toBeGreaterThan(20);
    expect(operations.every((operation) => typeof operation.operationId === 'string')).toBe(true);
    expect(Object.keys(document.paths ?? {})).toContain('/projects/{id}/leaderboard');
  });
});
