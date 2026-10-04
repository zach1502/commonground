import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  designListSchema,
  designSchema,
  submitResultSchema,
} from '../src/contracts/projects-designs.js';

import {
  BLANK,
  GARDEN,
  SMALL_GARDEN,
  createDraft,
  createProject,
  submitDocument,
  submitGarden,
} from './fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;
let molly: string;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

const draftBody = (title: string) => ({ title, blurb: 'Shade by the lane.', document: GARDEN });

describe('creating drafts', () => {
  it('starts a blank draft for a signed-in resident', async () => {
    const project = await createProject(h, staff);
    const response = await h.call('POST', `/projects/${project.id}/designs`, {
      cookie: bob,
      body: { from: 'blank' },
    });
    expect(response.status).toBe(201);
    const design = designSchema.parse(response.body);
    expect(design).toMatchObject({ status: 'draft', title: 'Untitled design', metrics: null });
    expect(design.author).toEqual({ id: BOB, displayName: 'Bob Walksadog' });
    expect(design.document).toEqual(BLANK);
  });

  it('forks a live design and copies its document', async () => {
    const project = await createProject(h, staff);
    const source = await submitGarden(h, bob, project.id);
    const response = await h.call('POST', `/projects/${project.id}/designs`, {
      cookie: molly,
      body: { from: 'fork', sourceDesignId: source.id },
    });
    const fork = designSchema.parse(response.body);
    expect(fork).toMatchObject({ forkedFrom: source.id, status: 'draft', title: source.title });
    expect(fork.document).toEqual(GARDEN);
  });

  it('refuses to fork without a source, or from a draft', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/designs`;
    const noSource = await h.call('POST', path, { cookie: molly, body: { from: 'fork' } });
    expect(noSource.status).toBe(400);
    const draft = await createDraft(h, molly, project.id);
    const fromDraft = await h.call('POST', path, {
      cookie: molly,
      body: { from: 'fork', sourceDesignId: draft.id },
    });
    expect(fromDraft.status).toBe(409);
  });
});

describe('creating drafts from the baseline and guards', () => {
  it('starts from the baseline when the project has one', async () => {
    const withBaseline = await createProject(h, staff, { baselineDocument: GARDEN });
    const path = `/projects/${withBaseline.id}/designs`;
    const response = await h.call('POST', path, { cookie: molly, body: { from: 'baseline' } });
    expect(designSchema.parse(response.body)).toMatchObject({ forkedFrom: null, document: GARDEN });
    const without = await createProject(h, staff);
    const missing = await h.call('POST', `/projects/${without.id}/designs`, {
      cookie: molly,
      body: { from: 'baseline' },
    });
    expect(missing.status).toBe(404);
  });

  it('needs a session, an existing project and an open project', async () => {
    const project = await createProject(h, staff);
    const path = `/projects/${project.id}/designs`;
    expect((await h.call('POST', path, { body: { from: 'blank' } })).status).toBe(401);
    const unknown = await h.call('POST', '/projects/missing/designs', {
      cookie: molly,
      body: { from: 'blank' },
    });
    expect(unknown.status).toBe(404);
    await h.call('PATCH', `/projects/${project.id}/status`, {
      cookie: staff,
      body: { status: 'closed' },
    });
    const closed = await h.call('POST', path, { cookie: molly, body: { from: 'blank' } });
    expect(closed.status).toBe(409);
    expect(errorKind(closed.body)).toBe('phase-closed');
  });
});

describe('saving and reading drafts', () => {
  it('saves a draft for its author only', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    const saved = await h.call('PUT', `/designs/${draft.id}`, {
      cookie: bob,
      body: draftBody('Beds'),
    });
    expect(designSchema.parse(saved.body)).toMatchObject({ title: 'Beds', document: GARDEN });
    const other = await h.call('PUT', `/designs/${draft.id}`, {
      cookie: molly,
      body: draftBody('x'),
    });
    // Another person's draft reads as missing, so the answer does not reveal that it exists.
    expect(other.status).toBe(404);
  });

  it('hides drafts from everyone but the author', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    expect((await h.call('GET', `/designs/${draft.id}`, { cookie: bob })).status).toBe(200);
    expect((await h.call('GET', `/designs/${draft.id}`, { cookie: molly })).status).toBe(404);
    expect((await h.call('GET', `/designs/${draft.id}`)).status).toBe(404);
  });

  it('rejects a document that does not match the schema', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    const body = { ...draftBody('Bad'), document: { ...GARDEN, version: 2 } };
    const response = await h.call('PUT', `/designs/${draft.id}`, { cookie: bob, body });
    expect(response.status).toBe(400);
  });

  it('refuses to edit a submitted design', async () => {
    const project = await createProject(h, staff);
    const live = await submitGarden(h, bob, project.id);
    const response = await h.call('PUT', `/designs/${live.id}`, {
      cookie: bob,
      body: draftBody('Late change'),
    });
    expect(response.status).toBe(409);
  });
});

describe('submitting', () => {
  it('computes metrics on the server and lists the design in the gallery', async () => {
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    expect(design.status).toBe('submitted');
    expect(design.metrics?.totals.gardenPlots).toBe(24);
    expect(design.metrics?.constraints.requiredFeatures.status).toBe('ok');
    expect(design.metrics?.heightmapSource).toBe('flat');
    expect(design.submittedAt).not.toBeNull();
    const gallery = designListSchema.parse(
      (await h.call('GET', `/projects/${project.id}/designs`)).body,
    );
    expect(gallery.designs.map((entry) => entry.id)).toEqual([design.id]);
    expect(gallery.designs[0]?.author).toBeNull();
  });

  it('blocks a design that breaks a hard constraint and lists the failures', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    expect(response.status).toBe(200);
    const result = submitResultSchema.parse(response.body);
    expect(result.status).toBe('draft');
    expect(result.hardFailures.map((failure) => failure.key)).toEqual(['requiredFeatures']);
    const still = designSchema.parse(
      (await h.call('GET', `/designs/${draft.id}`, { cookie: bob })).body,
    );
    expect(still.status).toBe('draft');
  });
});

describe('submitting against the hard constraints', () => {
  it('blocks a garden too small for the hard plot rule and names the constraint', async () => {
    const project = await createProject(h, staff);
    const response = await submitDocument(h, bob, project.id, SMALL_GARDEN);
    expect(response.status).toBe(200);
    const result = submitResultSchema.parse(response.body);
    expect(result.hardFailures).toEqual([
      { key: 'requiredFeatures', message: expect.stringContaining('18 plots') as unknown },
    ]);
  });

  it('refuses a document the metrics engine cannot measure with 400', async () => {
    const project = await createProject(h, staff);
    const hotTub = { id: 'tub', catalogId: 'hot-tub', position: { x: 5, y: 5 }, rotationDeg: 0 };
    const unknown = { ...GARDEN, items: [{ ...hotTub, locked: false }] };
    const response = await submitDocument(h, bob, project.id, unknown);
    expect(response.status).toBe(400);
    expect(errorKind(response.body)).toBe('validation');
  });

  it('caps each author at three live designs per project', async () => {
    const project = await createProject(h, staff);
    for (let count = 0; count < 3; count += 1) {
      await submitGarden(h, molly, project.id);
    }
    const draft = await createDraft(h, molly, project.id);
    await h.call('PUT', `/designs/${draft.id}`, { cookie: molly, body: draftBody('Fourth') });
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: molly });
    expect(response.status).toBe(422);
    expect(errorKind(response.body)).toBe('liveCapReached');
  });

  it('guards submit by author, state and phase', async () => {
    const project = await createProject(h, staff);
    const live = await submitGarden(h, bob, project.id);
    const draft = await createDraft(h, bob, project.id);
    expect((await h.call('POST', `/designs/${live.id}/submit`, { cookie: bob })).status).toBe(409);
    expect((await h.call('POST', `/designs/${draft.id}/submit`, { cookie: molly })).status).toBe(
      404,
    );
    expect((await h.call('POST', `/designs/${draft.id}/submit`)).status).toBe(401);
    await h.call('PATCH', `/projects/${project.id}/status`, {
      cookie: staff,
      body: { status: 'closed' },
    });
    const closed = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    expect(errorKind(closed.body)).toBe('phase-closed');
  });
});

describe('versions', () => {
  it('starts a new draft version and supersedes the live design', async () => {
    const project = await createProject(h, staff);
    const live = await submitGarden(h, bob, project.id);
    const response = await h.call('POST', `/designs/${live.id}/version`, { cookie: bob });
    expect(response.status).toBe(201);
    const version = designSchema.parse(response.body);
    expect(version).toMatchObject({ status: 'draft', versionOf: live.id, document: GARDEN });
    const old = designSchema.parse((await h.call('GET', `/designs/${live.id}`)).body);
    expect(old.status).toBe('superseded');
    const again = await h.call('POST', `/designs/${live.id}/version`, { cookie: bob });
    expect(again.status).toBe(409);
  });

  it('only lets the author make a version', async () => {
    const project = await createProject(h, staff);
    const live = await submitGarden(h, bob, project.id);
    expect((await h.call('POST', `/designs/${live.id}/version`, { cookie: molly })).status).toBe(
      403,
    );
  });
});
