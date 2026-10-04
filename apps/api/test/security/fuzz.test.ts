import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GARDEN, projectBody } from '../fixtures.js';
import { BOB, TEST_AUTH_SECRET } from '../harness.js';

import { garbageId, mutatedBody, type FuzzBody } from './fuzz-arbitraries.js';
import { fillPath, specRoutes, type SpecRoute } from './spec-routes.js';
import { PNG_BASE64, startWorld, type RawResult, type Role, type World } from './world.js';

const RUNS_PER_ROUTE = 200;
// A fixed seed keeps every run of the suite the same; change it to explore further.
const FUZZ_SEED = 20_260_928;
const PROPERTY_TIMEOUT_MS = 180_000;
const FORBIDDEN_TEXT = ['stack', 'at /', 'node_modules', TEST_AUTH_SECRET];
// Pages where A's id may reach B: public design pages, and the persona list the mock provider
// shows on the sign-in page, where A's id is the persona id.
const MAY_NAME_A = new Set(['getDesign', 'listDesigns', 'getLeaderboard', 'listPersonas', 'login']);

interface Seed {
  readonly pathId?: (world: World) => string;
  readonly body: (world: World) => Record<string, unknown>;
  /** Who sends the fuzzed body: the one who reaches the handler, and resident B for leaks. */
  readonly callers: readonly Role[];
}

const seeds: Readonly<Record<string, Seed>> = {
  login: { body: () => ({ persona: BOB }), callers: ['guest'] },
  saveSelfReport: { body: () => ({ fsa: 'V6B', ageBand: '65-plus' }), callers: ['residentB'] },
  createProject: { body: () => projectBody(), callers: ['staff', 'residentB'] },
  setProjectStatus: {
    pathId: (world) => world.projectId,
    body: () => ({ status: 'open', closesAt: null }),
    callers: ['staff'],
  },
  createDesign: {
    pathId: (world) => world.projectId,
    body: () => ({ from: 'blank', title: 'Lane' }),
    callers: ['residentA', 'residentB'],
  },
  saveDesign: {
    pathId: (world) => world.draftId,
    body: () => ({ title: 'Lane', blurb: '', document: GARDEN }),
    callers: ['residentA', 'residentB'],
  },
  setDesignThumbnail: {
    pathId: (world) => world.draftId,
    body: () => ({ image: PNG_BASE64 }),
    callers: ['residentA', 'residentB'],
  },
  describeIntent: {
    pathId: (world) => world.projectId,
    body: () => ({ text: 'a pond' }),
    callers: ['residentA', 'residentB'],
  },
  loadTerrain: {
    body: () => ({ polygonWgs84: { type: 'Polygon', coordinates: [] }, resolutionM: 2 }),
    callers: ['staff', 'residentB'],
  },
  loadSiteFeatures: { body: () => ({ parkName: 'Jonathan Rogers Park' }), callers: ['staff'] },
  castVote: {
    body: (world) => ({ designId: world.votedId, value: 1, reasons: [] }),
    callers: ['residentB', 'residentA'],
  },
  createComment: {
    pathId: (world) => world.liveId,
    body: () => ({ elementId: 'garden-1', kind: 'move', text: 'Nearer the lane.' }),
    callers: ['residentB', 'residentA'],
  },
  editComment: {
    pathId: (world) => world.commentId,
    body: () => ({ text: 'Keep the beds by the lane.' }),
    callers: ['residentA', 'residentB'],
  },
  resolveComment: {
    pathId: (world) => world.commentId,
    body: () => ({ reply: 'We kept them.' }),
    callers: ['staff', 'residentB'],
  },
  hideComment: {
    pathId: (world) => world.commentId,
    body: () => ({ hidden: false }),
    callers: ['staff', 'residentB'],
  },
  setMyVote: {
    pathId: (world) => world.votedId,
    body: () => ({ value: -1, reasons: ['play'], comment: 'Room to run.' }),
    callers: ['residentB', 'residentA'],
  },
};

let world: World;

beforeAll(async () => {
  world = await startWorld();
});

afterAll(async () => {
  await world.h.close();
});

function send(route: SpecRoute, role: Role, request: { path: string; body?: FuzzBody }) {
  const cookie = world.cookies[role];
  const body = request.body;
  return world.call(route.method, request.path, {
    ...(cookie === undefined ? {} : { cookie }),
    ...(body?.kind === 'json' ? { body: body.value } : {}),
    ...(body?.kind === 'raw' ? { rawBody: body.text } : {}),
  });
}

function assertSafe(route: SpecRoute, role: Role, response: RawResult): void {
  expect(response.status, `${route.operationId} as ${role}`).toBeLessThan(500);
  for (const text of FORBIDDEN_TEXT) {
    expect(response.text).not.toContain(text);
  }
  if (role === 'residentB' && !MAY_NAME_A.has(route.operationId)) {
    expect(response.text).not.toContain(world.userIds.residentA);
  }
}

async function assertStillHealthy(): Promise<void> {
  expect((await world.call('GET', '/health')).status).toBe(200);
}

const routes = specRoutes();
const options = { numRuns: RUNS_PER_ROUTE, seed: FUZZ_SEED };

describe('fuzzed bodies', () => {
  const bodyRoutes = routes.filter((route) => route.bodyKeys.length > 0);

  it('has a seed body for every route that takes one', () => {
    expect(bodyRoutes.filter((route) => seeds[route.operationId] === undefined)).toEqual([]);
  });

  for (const route of bodyRoutes) {
    it(
      `${route.method} ${route.path} answers 4xx or a success, never 5xx`,
      { timeout: PROPERTY_TIMEOUT_MS },
      async () => {
        const seed = seeds[route.operationId];
        if (seed === undefined) throw new Error(`no seed for ${route.operationId}`);
        const path = fillPath(route.path, seed.pathId?.(world) ?? '');
        const bodies = mutatedBody(seed.body(world), route.bodyKeys);
        await fc.assert(
          fc.asyncProperty(fc.constantFrom(...seed.callers), bodies, async (role, body) => {
            assertSafe(route, role, await send(route, role, { path, body }));
          }),
          options,
        );
        await assertStillHealthy();
      },
    );
  }
});

describe('fuzzed path ids', () => {
  const idRoutes = routes.filter((route) => route.path.includes('{id}'));

  for (const route of idRoutes) {
    it(
      `${route.method} ${route.path} answers 4xx for a garbage id`,
      { timeout: PROPERTY_TIMEOUT_MS },
      async () => {
        const seed = seeds[route.operationId];
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom<Role>('residentB', 'staff'),
            garbageId,
            async (role, id) => {
              const body: FuzzBody | undefined =
                seed === undefined ? undefined : { kind: 'json', value: seed.body(world) };
              const path = route.path.replace('{id}', id);
              const response = await send(route, role, {
                path,
                ...(body === undefined ? {} : { body }),
              });
              assertSafe(route, role, response);
              expect(response.status).toBeGreaterThanOrEqual(400);
            },
          ),
          options,
        );
        await assertStillHealthy();
      },
    );
  }
});

describe('fuzzed blob keys', () => {
  const blobRoute: SpecRoute = {
    method: 'GET',
    path: '/blobs/{key}',
    operationId: 'getBlob',
    bodyKeys: [],
  };

  it(
    'GET /blobs/{key} answers 4xx for a garbage key',
    { timeout: PROPERTY_TIMEOUT_MS },
    async () => {
      const keys = fc.oneof(
        garbageId,
        garbageId.map((id) => `thumbnails/${id}.png`),
      );
      await fc.assert(
        fc.asyncProperty(fc.constantFrom<Role>('guest', 'residentB'), keys, async (role, key) => {
          const response = await send(blobRoute, role, { path: `/blobs/${key}` });
          assertSafe(blobRoute, role, response);
          expect(response.status).toBeGreaterThanOrEqual(400);
        }),
        options,
      );
      await assertStillHealthy();
    },
  );
});

describe('fuzzed query values', () => {
  const queryRoutes = routes.filter(
    (route) => route.operationId === 'getQueue' || route.operationId.startsWith('exportInsights'),
  );

  for (const route of queryRoutes) {
    it(
      `${route.method} ${route.path}?n= never answers 5xx`,
      { timeout: PROPERTY_TIMEOUT_MS },
      async () => {
        const path = fillPath(route.path, world.projectId);
        await fc.assert(
          fc.asyncProperty(garbageId, async (n) => {
            assertSafe(route, 'staff', await send(route, 'staff', { path: `${path}?n=${n}` }));
          }),
          options,
        );
        await assertStillHealthy();
      },
    );
  }
});
