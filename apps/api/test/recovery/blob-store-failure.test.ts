import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema, submitResultSchema } from '../../src/contracts/projects-designs.js';
import { GARDEN, createDraft, createProject, thumbnailPath } from '../fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from '../harness.js';

import { FaultyBlobStore } from './faulty-blob-store.js';

// A 1x1 PNG: the eight-byte signature the thumbnail route checks, then the rest of a valid file.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const OK = 200;
const NOT_FOUND = 404;
const UNAVAILABLE = 503;

const store = new FaultyBlobStore();
let h: Harness;
let staff: string;
let bob: string;
let molly: string;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' }, { blobStore: store });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function submittedWhilePutsFail() {
  const project = await createProject(h, staff);
  const draft = await createDraft(h, bob, project.id);
  await h.call('PUT', `/designs/${draft.id}`, {
    cookie: bob,
    body: { title: 'Beds', blurb: 'By the lane.', document: GARDEN },
  });
  store.putMode = 'failing';
  const submit = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
  return { id: draft.id, submit };
}

describe('a blob store that refuses writes', () => {
  it('still submits, with no thumbnail and thumbnailPending true', async () => {
    const { id, submit } = await submittedWhilePutsFail();
    expect(submit.status).toBe(OK);
    const result = submitResultSchema.parse(submit.body);
    expect(result.status).toBe('submitted');
    expect(result.thumbnailPending).toBe(true);
    const design = designSchema.parse(
      (await h.call('GET', `/designs/${id}`, { cookie: molly })).body,
    );
    expect(design.status).toBe('submitted');
    expect(design.thumbnailUrl).toBeNull();
  });

  it('answers the thumbnail upload with 503 and a retry hint, then stores it on a retry', async () => {
    const { id } = await submittedWhilePutsFail();
    const body = { image: PNG_1X1 };
    const refused = await h.call('POST', `/designs/${id}/thumbnail`, { cookie: bob, body });
    expect(refused.status).toBe(UNAVAILABLE);
    expect(errorKind(refused.body)).toBe('storageUnavailable');
    expect(refused.headers.get('Retry-After')).toMatch(/^\d+$/);

    const missing = await h.app.request(thumbnailPath(id, PNG_1X1));
    expect(missing.status).toBe(NOT_FOUND);
    const missingBody = (await missing.json()) as { error: { kind: string; message: string } };
    expect(missingBody.error.kind).toBe('not-found');
    expect(missingBody.error.message).toMatch(/picture/i);

    store.putMode = 'working';
    const stored = await h.call('POST', `/designs/${id}/thumbnail`, { cookie: bob, body });
    expect(stored.status).toBe(OK);
    expect(designSchema.parse(stored.body).thumbnailUrl).toContain(thumbnailPath(id, PNG_1X1));
    expect((await h.app.request(thumbnailPath(id, PNG_1X1))).status).toBe(OK);
  });

  it('says a thumbnail is not pending when the design already has one', async () => {
    store.putMode = 'working';
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    await h.call('PUT', `/designs/${draft.id}`, {
      cookie: bob,
      body: { title: 'Beds', blurb: 'By the lane.', document: GARDEN },
    });
    await h.call('POST', `/designs/${draft.id}/thumbnail`, {
      cookie: bob,
      body: { image: PNG_1X1 },
    });
    const submit = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    expect(submitResultSchema.parse(submit.body).thumbnailPending).toBe(false);
  });
});

describe('a blob store that refuses reads', () => {
  it('answers a blob read with 503, not 500', async () => {
    store.getMode = 'failing';
    const response = await h.app.request('/blobs/thumbnails/any.png');
    store.getMode = 'working';
    expect(response.status).toBe(UNAVAILABLE);
    expect(errorKind(await response.json())).toBe('storageUnavailable');
  });

  it('refuses a submit it cannot measure with 503, and the design stays a draft', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    store.getMode = 'failing';
    const submit = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    store.getMode = 'working';
    expect(submit.status).toBe(UNAVAILABLE);
    expect(errorKind(submit.body)).toBe('storageUnavailable');
    const design = await h.call('GET', `/designs/${draft.id}`, { cookie: bob });
    expect(designSchema.parse(design.body).status).toBe('draft');
  });

  it('keeps the gallery and design reads working, and terrain answers 503', async () => {
    const { id } = await submittedWhilePutsFail();
    store.getMode = 'failing';
    const design = await h.call('GET', `/designs/${id}`, { cookie: molly });
    const projectId = designSchema.parse(design.body).projectId;
    const gallery = await h.call('GET', `/projects/${projectId}/designs`, { cookie: molly });
    const terrain = await h.call('GET', `/projects/${projectId}/terrain`, { cookie: molly });
    store.getMode = 'working';
    store.putMode = 'working';
    expect(design.status).toBe(OK);
    expect(gallery.status).toBe(OK);
    expect(terrain.status).toBe(UNAVAILABLE);
    expect(errorKind(terrain.body)).toBe('storageUnavailable');
  });
});
