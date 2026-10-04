import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { errorBodySchema } from '../../src/contracts/common.js';

import { startWorld, type RawResult, type World } from './world.js';

let world: World;

beforeAll(async () => {
  world = await startWorld({ FEATURE_SUMMARY: 'false' });
});

afterAll(async () => {
  await world.h.close();
});

const strictErrorBody = errorBodySchema.strict().extend({
  error: errorBodySchema.shape.error.strict(),
});

function keysDeep(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysDeep(inner)]);
}

function expectTypedError(response: RawResult, status: number): void {
  expect(response.status).toBe(status);
  strictErrorBody.parse(response.body);
  expect(keysDeep(response.body)).not.toContain('stack');
  expect(keysDeep(response.body)).not.toContain('cause');
}

describe('every error answer has the typed shape and nothing more', () => {
  const b = () => world.cookies.residentB ?? '';
  const cases: readonly [string, () => Promise<RawResult>, number][] = [
    [
      '400 validation',
      () => world.call('POST', '/votes', { cookie: b(), body: { value: 7 } }),
      400,
    ],
    ['400 broken JSON', () => world.call('POST', '/votes', { cookie: b(), rawBody: '{' }), 400],
    ['401 unauthenticated', () => world.call('GET', '/me'), 401],
    [
      '403 forbidden',
      () => world.call('GET', `/projects/${world.projectId}/insights`, { cookie: b() }),
      403,
    ],
    ['404 unknown route', () => world.call('GET', '/no/such/route'), 404],
    [
      '404 private draft',
      () => world.call('GET', `/designs/${world.draftId}`, { cookie: b() }),
      404,
    ],
    ['404 missing blob', () => world.call('GET', '/blobs/thumbnails/nothing.png'), 404],
    [
      '409 wrong status',
      () =>
        world.call('POST', `/designs/${world.liveId}/submit`, {
          cookie: world.cookies.residentA ?? '',
        }),
      409,
    ],
    [
      '503 feature off',
      () =>
        world.call('GET', `/projects/${world.projectId}/summary`, {
          cookie: world.cookies.staff ?? '',
        }),
      503,
    ],
  ];

  for (const [name, send, status] of cases) {
    it(name, async () => {
      expectTypedError(await send(), status);
    });
  }

  it('500 hides the thrown error, its stack and its cause', async () => {
    const failure = new Error('database password is hunter2', {
      cause: new Error('at /srv/db.ts'),
    });
    vi.spyOn(world.h.deps.repos.projects, 'list').mockRejectedValueOnce(failure);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await world.call('GET', '/projects');
    expectTypedError(response, 500);
    expect(response.text).not.toContain('hunter2');
    expect(response.text).not.toContain('at /');
    vi.restoreAllMocks();
  });
});
