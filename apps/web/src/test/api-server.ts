import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '@parkshape/api-client';
import { createApiHandlers } from '@parkshape/api-client/msw';
import { DEFAULT_TERRAFORM_LIMIT_M, FakeClock, ROOT_ZONE_RADIUS_PER_DBH_CM } from '@parkshape/core';
import { StaticTileSource } from '@parkshape/ui';

import { createWebApi, type Persona, type Project, type User } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { createReviewApi } from '../features/review/review-api';
import { createMemorySelfReportStore } from '../session/self-report';

export const TEST_API_URL = 'http://api.test';
/** The fixed time the test clock reads, 3:20 pm in Vancouver on 26 September 2026. */
export const TEST_NOW = new Date('2026-09-26T22:20:00Z');

export const RESIDENT: User = {
  id: 'persona-molly-swingset',
  displayName: 'Molly Swingset',
  role: 'resident',
};
export const STAFF: User = {
  id: 'persona-paula-blueprint',
  displayName: 'Paula Blueprint',
  role: 'staff',
};

export const PERSONAS: Persona[] = [
  { ...RESIDENT, about: 'Brings her two kids to the playground after school.' },
  {
    id: 'persona-gail-marigold',
    displayName: 'Gail Marigold',
    role: 'resident',
    about: 'Grows food.',
  },
  { ...STAFF, about: 'Park planner who runs the project.' },
];

const generated = createApiHandlers(TEST_API_URL);

/** The generated example project, renamed; call while the server is listening. */
export async function projectFixture(overrides: Partial<Project> = {}): Promise<Project> {
  const response = await fetch(`${TEST_API_URL}/projects/example`);
  const example = (await response.json()) as Project;
  return {
    ...example,
    id: 'jrp',
    name: 'Jonathan Rogers Park',
    status: 'open',
    parameters: {
      ...example.parameters,
      terraform: { ...example.parameters.terraform, maxDeviationM: DEFAULT_TERRAFORM_LIMIT_M },
      treeProtection: {
        ...example.parameters.treeProtection,
        rootZonePerDbhCm: ROOT_ZONE_RADIUS_PER_DBH_CM,
      },
    },
    ...overrides,
  };
}

/** Session state the handlers read; tests change it to sign people in and out. */
export const session: { user: User | null } = { user: null };

function unauthorized() {
  return HttpResponse.json(
    { error: { kind: 'unauthenticated', message: 'Log in first', requestId: 'r1' } },
    { status: 401 },
  );
}

const sessionHandlers: HttpHandler[] = [
  http.get(`${TEST_API_URL}/me`, () =>
    session.user === null ? unauthorized() : HttpResponse.json({ user: session.user }),
  ),
  http.get(`${TEST_API_URL}/auth/personas`, () =>
    HttpResponse.json({ personas: PERSONAS, staffCodeRequired: false }),
  ),
  http.post(`${TEST_API_URL}/auth/login`, async ({ request }) => {
    const { persona } = (await request.json()) as { persona: string };
    const found = PERSONAS.find((candidate) => candidate.id === persona);
    if (found === undefined) {
      return HttpResponse.json(
        { error: { kind: 'unknown-persona', message: 'No such persona', requestId: 'r2' } },
        { status: 400 },
      );
    }
    session.user = { id: found.id, displayName: found.displayName, role: found.role };
    return HttpResponse.json({ user: session.user });
  }),
  http.post(`${TEST_API_URL}/auth/logout`, () => {
    session.user = null;
    return new HttpResponse(null, { status: 204 });
  }),
];

/** Generated example handlers, with the session routes replaced by stateful ones. */
export const apiServer = setupServer(...sessionHandlers, ...Object.values(generated));

export function createTestDeps(): WebDeps {
  const client = createApiClient({ baseUrl: TEST_API_URL });
  const comments = createReviewApi(client);
  return {
    api: createWebApi(client),
    review: comments,
    feedback: comments,
    apiBaseUrl: TEST_API_URL,
    selfReports: createMemorySelfReportStore(),
    pollIntervalMs: 5000,
    mapTiles: new StaticTileSource({ colour: 'green', attribution: 'Test fill' }),
    describeIt: 'on',
    clock: new FakeClock(TEST_NOW),
    editor: {
      storage: { local: window.localStorage, session: window.sessionStorage },
      randomSeed: 1,
      testHook: 'off',
      terraform: 'on',
    },
  };
}
