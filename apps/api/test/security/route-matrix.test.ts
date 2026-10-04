import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXTRA_ROUTES, MATRIX, type MatrixCase } from './matrix-table.js';
import { fillPath, specRoutes, type SpecRoute } from './spec-routes.js';
import { ROLES, startWorld, type Role, type World } from './world.js';

const SPEC_ROUTE_COUNT = 42;
const MISSING_ID = 'no-such-id-7f3a';

let world: World;

beforeAll(async () => {
  world = await startWorld();
});

afterAll(async () => {
  await world.h.close();
});

interface Probe {
  readonly method: string;
  readonly path: (id: string) => string;
  readonly probe: MatrixCase;
}

async function callAs(role: Role, request: Probe, id: string) {
  const pathId = request.probe.pathTarget?.(world) ?? id;
  const cookie =
    request.probe.session === 'fresh' ? await world.cookieFor(role) : world.cookies[role];
  const body = request.probe.body?.(id);
  const options = {
    ...(cookie === undefined ? {} : { cookie }),
    ...(body === undefined ? {} : { body }),
  };
  return world.call(request.method, request.path(pathId), options);
}

/** The status and error text a caller sees, without the per-request id. */
function answerOf(response: { status: number; body: unknown }) {
  const error = (response.body as { error?: { kind?: string; message?: string } } | undefined)
    ?.error;
  return { status: response.status, kind: error?.kind, message: error?.message };
}

async function runProbe(request: Probe): Promise<void> {
  const id = request.probe.target === undefined ? '' : await request.probe.target(world);
  const actual: Record<string, number> = {};
  for (const role of ROLES) {
    actual[role] = (await callAs(role, request, id)).status;
  }
  expect(actual).toEqual(request.probe.expected);
  if (request.probe.privacy !== 'private') return;
  for (const role of ['residentB', 'staff'] as const) {
    const real = answerOf(await callAs(role, request, id));
    const missing = answerOf(await callAs(role, request, MISSING_ID));
    expect(real).toEqual(missing);
  }
}

function specProbes(route: SpecRoute): Probe[] {
  const cases = MATRIX[route.operationId] ?? [];
  return cases.map((probe) => ({
    method: route.method,
    path: (id: string) => fillPath(route.path, id),
    probe,
  }));
}

describe('route matrix', () => {
  const routes = specRoutes();

  it('covers every operation in openapi.json and nothing else', () => {
    expect(routes).toHaveLength(SPEC_ROUTE_COUNT);
    const missing = routes.filter((route) => (MATRIX[route.operationId] ?? []).length === 0);
    expect(missing.map((route) => route.operationId)).toEqual([]);
    const known = new Set(routes.map((route) => route.operationId));
    expect(Object.keys(MATRIX).filter((operationId) => !known.has(operationId))).toEqual([]);
  });

  for (const route of routes) {
    for (const request of specProbes(route)) {
      it(`${route.method} ${route.path}: ${request.probe.name}`, async () => {
        await runProbe(request);
      });
    }
  }

  for (const extra of EXTRA_ROUTES) {
    for (const probe of extra.cases) {
      it(`GET ${extra.path('{id}')}: ${probe.name}`, async () => {
        await runProbe({ method: 'GET', path: extra.path, probe });
      });
    }
  }
});

describe("one resident's self report", () => {
  it("stays A's when B saves their own", async () => {
    const b = world.cookies.residentB ?? '';
    const a = world.cookies.residentA ?? '';
    const report = { fsa: 'V6B', ageBand: '65-plus' };
    await world.call('PATCH', '/me/self-report', { cookie: b, body: report });
    const mine = await world.call('GET', '/me', { cookie: a });
    expect(mine.body).toMatchObject({ selfReport: { fsa: 'V5T', ageBand: '30-44' } });
    const theirs = await world.call('GET', '/me', { cookie: b });
    expect(JSON.stringify(theirs.body)).not.toContain(world.userIds.residentA);
  });
});
