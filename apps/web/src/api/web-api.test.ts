import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { designDocumentSchema } from '@parkshape/core';

import {
  apiServer,
  createTestDeps,
  PERSONAS,
  projectFixture,
  session,
  TEST_API_URL,
} from '../test/api-server';

describe('createWebApi', () => {
  it('returns null from getMe when signed out', async () => {
    expect(await createTestDeps().api.getMe()).toBeNull();
  });

  it('logs in, reads the session and logs out', async () => {
    const { api } = createTestDeps();
    const user = await api.login('persona-molly-swingset');
    expect(user.displayName).toBe('Molly Swingset');
    expect(await api.getMe()).toEqual(user);
    await api.logout();
    expect(session.user).toBeNull();
  });

  it('rethrows errors other than 401 from getMe', async () => {
    apiServer.use(http.get(`${TEST_API_URL}/me`, () => new HttpResponse('down', { status: 500 })));
    await expect(createTestDeps().api.getMe()).rejects.toMatchObject({ status: 500 });
  });

  it('lists personas and whether staff need the access code', async () => {
    expect(await createTestDeps().api.listPersonas()).toEqual({
      personas: PERSONAS,
      staffCodeRequired: false,
    });
  });

  it('sends the access code with the login when there is one', async () => {
    let sent: unknown;
    apiServer.use(
      http.post(`${TEST_API_URL}/auth/login`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          user: { id: 'persona-paula-blueprint', displayName: 'Paula Blueprint', role: 'staff' },
        });
      }),
    );
    await createTestDeps().api.login('persona-paula-blueprint', 'harbour-otter-42');
    expect(sent).toEqual({ persona: 'persona-paula-blueprint', accessCode: 'harbour-otter-42' });
  });

  it('lists and reads projects and counts designs', async () => {
    const project = await projectFixture();
    apiServer.use(
      http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
      http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
    );
    const { api } = createTestDeps();
    expect(await api.listProjects()).toEqual([project]);
    expect((await api.getProject('jrp')).name).toBe('Jonathan Rogers Park');
    expect(await api.countDesigns('jrp')).toBe(1);
  });
});

describe('describe it calls', () => {
  it('starts a design from a description, with the seed only when given', async () => {
    const { api } = createTestDeps();
    const bodies: unknown[] = [];
    apiServer.use(
      http.post(`${TEST_API_URL}/projects/jrp/designs`, async ({ request }) => {
        bodies.push(await request.json());
        const example = await fetch(`${TEST_API_URL}/designs/example`);
        return HttpResponse.json((await example.json()) as Record<string, unknown>, {
          status: 201,
        });
      }),
    );
    await api.describeDesign('jrp', { text: 'a pond' });
    await api.describeDesign('jrp', { text: 'a pond', seed: 3 });
    expect(bodies).toEqual([
      { from: 'describe', text: 'a pond' },
      { from: 'describe', text: 'a pond', seed: 3 },
    ]);
  });
});

describe('design calls', () => {
  it('creates, reads, saves and submits a design', async () => {
    const { api } = createTestDeps();
    const created = await api.createDesign('jrp', 'baseline');
    expect(created.document.version).toBe(1);
    const read = await api.getDesign(created.id);
    expect(read.id).toBe(created.id);
    const saved = await api.saveDraft(created.id, {
      title: read.title,
      blurb: read.blurb,
      document: designDocumentSchema.parse(read.document),
    });
    expect(saved).toMatchObject({ kind: 'saved', design: { id: created.id } });
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/${created.id}/submit`, () =>
        HttpResponse.json({ status: 'submitted', metrics: {}, hardFailures: [], softWarnings: [] }),
      ),
    );
    expect((await api.submitDesign(created.id)).kind).toBe('submitted');
  });

  it('reports the hard failures that block a submit', async () => {
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/submit`, () =>
        HttpResponse.json({
          status: 'draft',
          metrics: {},
          hardFailures: [{ key: 'requiredFeatures', message: 'Add more plots.' }],
          softWarnings: [{ key: 'budget', message: 'A little over.', badge: 'Over budget 12%' }],
        }),
      ),
    );
    const result = await createTestDeps().api.submitDesign('d1');
    expect(result).toEqual({
      kind: 'blocked',
      hardFailures: [{ key: 'requiredFeatures', message: 'Add more plots.' }],
      softWarnings: [{ key: 'budget', message: 'A little over.', badge: 'Over budget 12%' }],
    });
  });

  it('surfaces the live cap message', async () => {
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/submit`, () =>
        HttpResponse.json(
          {
            error: { kind: 'liveCapReached', message: 'Three live already', requestId: 'r9' },
          },
          { status: 422 },
        ),
      ),
    );
    const result = await createTestDeps().api.submitDesign('d1');
    expect(result).toEqual({ kind: 'capReached', message: 'Three live already' });
  });
});

describe('staff calls', () => {
  it('loads site features, terrain, creates a project and changes its status', async () => {
    const { api } = createTestDeps();
    const site = await api.loadSiteFeatures({ parkName: 'Jonathan Rogers Park' });
    expect(Array.isArray(site.features)).toBe(true);
    const terrain = await api.loadTerrain(site.parcel.polygonWgs84, 1);
    expect(typeof terrain.heightmapRef).toBe('string');
    const project = await projectFixture();
    const created = await api.createProject({
      name: 'Jonathan Rogers Park',
      parcel: project.parcel as never,
      heightmapRef: terrain.heightmapRef,
      parameters: project.parameters as never,
      baselineDocument: designDocumentSchema.parse({
        version: 1,
        items: [],
        paths: [],
        areas: [],
        gradeDelta: { cells: [] },
        zones: [],
      }),
      zones: [],
      closesAt: '2026-10-31',
    });
    expect(typeof created.id).toBe('string');
    expect(created.closesAt).toBe('2026-10-31');
    const closed = await api.setProjectStatus(created.id, 'closed');
    expect(typeof closed.status).toBe('string');
  });

  it('reads the project terrain as a heightmap', async () => {
    const elevations = new Float32Array([1.5, 2.25, -0.5, 4]);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(elevations.buffer)));
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/terrain`, () =>
        HttpResponse.json({
          source: 'stored',
          width: 2,
          height: 2,
          resolutionM: 1,
          originLocal: { x: -1, y: 0 },
          elevations: base64,
        }),
      ),
    );
    const heightmap = await createTestDeps().api.getTerrain('jrp');
    expect(heightmap).toMatchObject({
      width: 2,
      height: 2,
      resolutionM: 1,
      originLocal: { x: -1, y: 0 },
    });
    expect(Array.from(heightmap.elevations)).toEqual([1.5, 2.25, -0.5, 4]);
  });
});

describe('createWebApi terrain requests', () => {
  it('asks for a project terrain once, so a loader can start it and the 3D view reuse it', async () => {
    let requests = 0;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/terrain`, () => {
        requests += 1;
        return HttpResponse.json({
          source: 'stored',
          width: 1,
          height: 1,
          resolutionM: 1,
          originLocal: { x: 0, y: 0 },
          elevations: 'AAAAAA==',
        });
      }),
    );
    const { api } = createTestDeps();
    await Promise.all([api.getTerrain('jrp'), api.getTerrain('jrp')]);
    await api.getTerrain('jrp');
    expect(requests).toBe(1);
  });

  it('asks again for a terrain that failed to load', async () => {
    let requests = 0;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/terrain`, () => {
        requests += 1;
        return new HttpResponse('down', { status: 500 });
      }),
    );
    const { api } = createTestDeps();
    await expect(api.getTerrain('jrp')).rejects.toThrow();
    await expect(api.getTerrain('jrp')).rejects.toThrow();
    expect(requests).toBe(2);
  });
});

describe('conditional draft saves', () => {
  it('sends the stamp it last saw, and returns the stored draft on 409', async () => {
    const { api } = createTestDeps();
    const read = await api.getDesign('d1');
    const current = { ...read, id: 'd1', updatedAt: '2026-09-26T22:20:00.001Z' };
    let sent: unknown;
    apiServer.use(
      http.put(`${TEST_API_URL}/designs/d1`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          {
            code: 'draftChanged',
            error: { kind: 'draftChanged', message: 'Saved elsewhere.', requestId: 'r1' },
            current,
          },
          { status: 409 },
        );
      }),
    );
    const outcome = await api.saveDraft('d1', {
      title: read.title,
      blurb: read.blurb,
      document: designDocumentSchema.parse(read.document),
      expectedUpdatedAt: read.updatedAt,
    });
    expect(sent).toMatchObject({ expectedUpdatedAt: read.updatedAt });
    expect(outcome).toEqual({ kind: 'changed', current });
  });

  it('rethrows a 409 that carries no stored draft', async () => {
    const { api } = createTestDeps();
    const read = await api.getDesign('d1');
    apiServer.use(
      http.put(`${TEST_API_URL}/designs/d1`, () =>
        HttpResponse.json(
          { error: { kind: 'wrong-status', message: 'Submitted.', requestId: 'r1' } },
          { status: 409 },
        ),
      ),
    );
    const draft = {
      title: read.title,
      blurb: read.blurb,
      document: designDocumentSchema.parse(read.document),
    };
    await expect(api.saveDraft('d1', draft)).rejects.toMatchObject({ kind: 'wrong-status' });
  });
});

describe('createWebApi vote changes', () => {
  it('sets a vote with its comment by PUT and withdraws it by DELETE on the vote resource', async () => {
    const calls: { method: string; body: unknown }[] = [];
    const path = `${TEST_API_URL}/designs/d1/my-vote`;
    const counts = { id: 'd1', up: 0, down: 1 };
    apiServer.use(
      http.put(path, async ({ request }) => {
        calls.push({ method: 'PUT', body: await request.json() });
        const vote = { id: 'v1', designId: 'd1', value: -1, reasons: ['water'], comment: 'Wet.' };
        const at = { createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z' };
        return HttpResponse.json({ outcome: 'updated', vote: { ...vote, ...at }, design: counts });
      }),
      http.delete(path, () => {
        calls.push({ method: 'DELETE', body: null });
        return HttpResponse.json({ outcome: 'withdrawn', design: { ...counts, down: 0 } });
      }),
    );
    const { api } = createTestDeps();
    const set = await api.setMyVote({
      designId: 'd1',
      value: -1,
      reasons: ['water'],
      comment: 'Wet.',
    });
    expect(set.vote.comment).toBe('Wet.');
    expect(await api.withdrawMyVote('d1')).toMatchObject({ outcome: 'withdrawn' });
    expect(calls).toEqual([
      { method: 'PUT', body: { value: -1, reasons: ['water'], comment: 'Wet.' } },
      { method: 'DELETE', body: null },
    ]);
  });
});
