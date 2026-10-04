import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema, draftChangedSchema } from '../src/contracts/projects-designs.js';

import { BLANK, GARDEN, createDraft, createProject } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_DRAFT_SAVES_PER_MINUTE: '1000' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

const body = (title: string, document = GARDEN) => ({
  title,
  blurb: 'Shade by the lane.',
  document,
});

async function freshDraft() {
  const project = await createProject(h, staff);
  return createDraft(h, bob, project.id);
}

function save(id: string, payload: Record<string, unknown>) {
  return h.call('PUT', `/designs/${id}`, { cookie: bob, body: payload });
}

describe('PUT /designs/{id} with expectedUpdatedAt', () => {
  it('sends updatedAt with every design, and a save moves it forward', async () => {
    const draft = await freshDraft();
    expect(draft.updatedAt).toBe(draft.createdAt);
    const saved = designSchema.parse(
      (await save(draft.id, { ...body('Tab A'), expectedUpdatedAt: draft.updatedAt })).body,
    );
    expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(draft.updatedAt));
  });

  it('answers 409 draftChanged with the stored draft when the stamp is stale', async () => {
    const draft = await freshDraft();
    const tabA = await save(draft.id, { ...body('Tab A'), expectedUpdatedAt: draft.updatedAt });
    expect(tabA.status).toBe(200);
    const stored = designSchema.parse(tabA.body);
    const tabB = await save(draft.id, {
      ...body('Tab B', BLANK),
      expectedUpdatedAt: draft.updatedAt,
    });
    expect(tabB.status).toBe(409);
    const conflict = draftChangedSchema.parse(tabB.body);
    expect(conflict.code).toBe('draftChanged');
    expect(errorKind(tabB.body)).toBe('draftChanged');
    expect(conflict.current).toEqual(stored);
    const reread = await h.call('GET', `/designs/${draft.id}`, { cookie: bob });
    expect(designSchema.parse(reread.body)).toMatchObject({ title: 'Tab A', document: GARDEN });
  });

  it('overwrites when the caller resends with the stamp from the 409', async () => {
    const draft = await freshDraft();
    await save(draft.id, { ...body('Tab A'), expectedUpdatedAt: draft.updatedAt });
    const stale = await save(draft.id, { ...body('Tab B'), expectedUpdatedAt: draft.updatedAt });
    const { current } = draftChangedSchema.parse(stale.body);
    const kept = await save(draft.id, { ...body('Tab B'), expectedUpdatedAt: current.updatedAt });
    expect(kept.status).toBe(200);
    expect(designSchema.parse(kept.body).title).toBe('Tab B');
  });

  it('keeps saving without a stamp, for older clients', async () => {
    const draft = await freshDraft();
    await save(draft.id, body('Tab A'));
    expect((await save(draft.id, body('Tab B'))).status).toBe(200);
  });

  it('accepts only one of two saves sent together from the same stamp', async () => {
    const draft = await freshDraft();
    const results = await Promise.all([
      save(draft.id, { ...body('Tab A'), expectedUpdatedAt: draft.updatedAt }),
      save(draft.id, { ...body('Tab B'), expectedUpdatedAt: draft.updatedAt }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it('refuses a stamp that is not a date', async () => {
    const draft = await freshDraft();
    const response = await save(draft.id, { ...body('Tab A'), expectedUpdatedAt: 'yesterday' });
    expect(response.status).toBe(400);
  });
});
