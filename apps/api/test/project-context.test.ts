import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { contextFeatureSchema, err, type Result, type SiteContext } from '@parkshape/core';
import {
  InMemorySiteContextProvider,
  type SiteContextError,
  type SiteContextProvider,
  type SiteContextRequest,
} from '@parkshape/terrain';

import { createApp } from '../src/app.js';
import { siteContextResultSchema } from '../src/contracts/site.js';

import { createProject } from './fixtures.js';
import { errorKind, MOLLY, STAFF, startHarness, type Harness } from './harness.js';

const FEATURES_FILE = new URL(
  '../../../packages/terrain/fixtures/jonathan-rogers/features.json',
  import.meta.url,
);
const recordedParcel = (
  JSON.parse(readFileSync(FEATURES_FILE, 'utf8')) as {
    parcel: { polygonLocal: unknown; origin: unknown };
  }
).parcel;

/** The Jonathan Rogers Park parcel as a project stores it, so the static fixture covers it. */
const JONATHAN_ROGERS_PARCEL = {
  id: 'jonathan-rogers',
  name: 'Jonathan Rogers Park',
  polygon: recordedParcel.polygonLocal,
  origin: recordedParcel.origin,
};
const RECORDED_AT = '2026-10-03T12:00:00.000Z';
const STOP = contextFeatureSchema.parse({
  id: 'stop-60006',
  kind: 'busStop',
  name: 'Eastbound W Broadway @ Columbia St',
  source: { name: 'TransLink', datasetId: 'gtfs-stops' },
  geometry: { type: 'point', position: { x: 18.9, y: -97.6 } },
});
const OFFLINE_BUDGET_MS = 1000;

/** Answers from the features it was given, counts calls, and fails while `failing` is set. */
class CountingProvider implements SiteContextProvider {
  readonly name = 'counting';
  calls = 0;
  failing = false;
  private readonly inner = new InMemorySiteContextProvider({
    features: [STOP],
    recordedAt: RECORDED_AT,
  });

  getContext(request: SiteContextRequest): Promise<Result<SiteContext, SiteContextError>> {
    this.calls += 1;
    if (this.failing) {
      return Promise.resolve(
        err({ kind: 'network', url: 'https://example.test', message: 'down' }),
      );
    }
    return this.inner.getContext(request);
  }
}

let h: Harness;
let staff: string;
let molly: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function callWith(provider: SiteContextProvider, path: string) {
  const app = createApp({ ...h.deps, siteContext: provider });
  const response = await app.request(path, { headers: { Cookie: molly } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe('GET /projects/{id}/context on the static fixture', () => {
  it('returns the recorded streets, sidewalks and stops around the parcel', async () => {
    const project = await createProject(h, staff, { parcel: JONATHAN_ROGERS_PARCEL });
    const response = await h.call('GET', `/projects/${project.id}/context`);
    expect(response.status).toBe(200);
    const context = siteContextResultSchema.parse(response.body);
    expect(context.bufferM).toBe(300);
    const kinds = new Set(context.features.map((feature) => feature.kind));
    expect(kinds).toEqual(new Set(['street', 'sidewalk', 'busStop', 'parking', 'bikeway']));
    const names = context.features.filter((f) => f.kind === 'street').map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(['W 7th Ave', 'W 8th Ave', 'Columbia St', 'Manitoba St']),
    );
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('answers an empty list for a parcel the recording does not cover', async () => {
    const project = await createProject(h, staff);
    const response = await h.call('GET', `/projects/${project.id}/context`);
    expect(response.status).toBe(200);
    expect(siteContextResultSchema.parse(response.body).features).toEqual([]);
  });
});

describe('GET /projects/{id}/context caching', () => {
  it('stores the first answer and serves the second from the blob store', async () => {
    const provider = new CountingProvider();
    const project = await createProject(h, staff, { parcel: JONATHAN_ROGERS_PARCEL });
    const first = await callWith(provider, `/projects/${project.id}/context`);
    const second = await callWith(provider, `/projects/${project.id}/context`);
    expect(first.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(provider.calls).toBe(1);
    expect(await h.deps.blobStore.get(`context/${project.id}.json`)).toBeDefined();
  });

  it('answers 503 when the provider fails, and does not keep the failure', async () => {
    const provider = new CountingProvider();
    provider.failing = true;
    const project = await createProject(h, staff, { parcel: JONATHAN_ROGERS_PARCEL });
    const failed = await callWith(provider, `/projects/${project.id}/context`);
    expect(failed.status).toBe(503);
    expect(errorKind(failed.body)).toBe('contextUnavailable');
    expect(failed.headers.get('Retry-After')).toBe('5');
    provider.failing = false;
    const retried = await callWith(provider, `/projects/${project.id}/context`);
    expect(retried.status).toBe(200);
    expect(siteContextResultSchema.parse(retried.body).features).toHaveLength(1);
  });
});

describe('GET /projects/{id}/context for a project that does not exist', () => {
  it('answers the same 404 as the project read', async () => {
    const context = await h.call('GET', '/projects/nope/context');
    const project = await h.call('GET', '/projects/nope');
    expect(context.status).toBe(404);
    expect(errorKind(context.body)).toBe('not-found');
    const messageOf = (body: unknown) => (body as { error: { message: string } }).error.message;
    expect(messageOf(context.body)).toBe(messageOf(project.body));
  });
});

describe('GET /projects/{id}/context with PARKSHAPE_OFFLINE=1', () => {
  it('answers 503 at once when the live provider cannot reach its sources', async () => {
    const offline = await startHarness({
      PARKSHAPE_OFFLINE: '1',
      SITE_CONTEXT_PROVIDER: 'vancouver',
    });
    try {
      const cookie = await offline.login(STAFF);
      const project = await createProject(offline, cookie, { parcel: JONATHAN_ROGERS_PARCEL });
      const started = performance.now();
      const response = await offline.call('GET', `/projects/${project.id}/context`);
      expect(performance.now() - started).toBeLessThan(OFFLINE_BUDGET_MS);
      expect(response.status).toBe(503);
      expect(errorKind(response.body)).toBe('contextUnavailable');
    } finally {
      await offline.close();
    }
  });

  it('serves the recorded fixture with no network from the static provider', async () => {
    const offline = await startHarness({ PARKSHAPE_OFFLINE: '1' });
    try {
      const cookie = await offline.login(STAFF);
      const project = await createProject(offline, cookie, { parcel: JONATHAN_ROGERS_PARCEL });
      const response = await offline.call('GET', `/projects/${project.id}/context`);
      expect(response.status).toBe(200);
      expect(siteContextResultSchema.parse(response.body).features.length).toBeGreaterThan(0);
    } finally {
      await offline.close();
    }
  });
});
