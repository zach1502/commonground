import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_LIVE_SUBMISSIONS, type DesignDocumentInput } from '@parkshape/core';

import { designSchema, submitResultSchema } from '../src/contracts/projects-designs.js';

import { RaceWindows } from './consistency/windows.js';
import { GARDEN, SMALL_GARDEN, createDraft, createProject, submitDocument } from './fixtures.js';
import {
  KEVIN,
  BOB,
  MOLLY,
  SALLY,
  STAFF,
  errorKind,
  startHarness,
  type Harness,
} from './harness.js';

const SUBMISSIONS_PER_HOUR = 5;
const HOUR_MS = 3_600_000;

let h: Harness;
let windows: RaceWindows;
let staff: string;

beforeAll(async () => {
  windows = new RaceWindows();
  h = await startHarness(
    { RATE_LIMIT_SUBMISSIONS_PER_HOUR: String(SUBMISSIONS_PER_HOUR) },
    { repos: (inner) => windows.wrap(inner) },
  );
  staff = await h.login(STAFF);
});

afterAll(async () => {
  await h.close();
});

/** Saves the draft with this document, as the editor does, and checks the save went through. */
async function save(cookie: string, designId: string, document: DesignDocumentInput) {
  const body = { title: 'Garden corner', blurb: 'Beds by the lane.', document };
  expect((await h.call('PUT', `/designs/${designId}`, { cookie, body })).status).toBe(200);
}

/** Takes every token left in the person's submissions bucket and counts them. */
async function drainTokens(userId: string): Promise<number> {
  let taken = 0;
  while (taken <= SUBMISSIONS_PER_HOUR) {
    const take = await h.deps.limits.submissions.take(userId);
    if (take.kind === 'limited') break;
    taken += 1;
  }
  h.clock.advance(HOUR_MS);
  return taken;
}

describe('the submissions token on submit', () => {
  it('spends exactly one token on a submit that answers 200', async () => {
    const bob = await h.login(BOB);
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    await save(bob, draft.id, GARDEN);
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    expect(response.status).toBe(200);
    expect(await drainTokens(BOB)).toBe(SUBMISSIONS_PER_HOUR - 1);
  });

  it('spends no token on submits a hard rule blocks, then one on the corrected design', async () => {
    const sally = await h.login(SALLY);
    const project = await createProject(h, staff);
    const draft = await createDraft(h, sally, project.id);
    await save(sally, draft.id, SMALL_GARDEN);
    const submit = () => h.call('POST', `/designs/${draft.id}/submit`, { cookie: sally });
    for (let attempt = 0; attempt <= SUBMISSIONS_PER_HOUR; attempt += 1) {
      const blocked = await submit();
      expect(blocked.status).toBe(200);
      expect(submitResultSchema.parse(blocked.body).status).toBe('draft');
    }
    const stored = await h.call('GET', `/designs/${draft.id}`, { cookie: sally });
    expect(designSchema.parse(stored.body).status).toBe('draft');
    await save(sally, draft.id, GARDEN);
    const passed = await submit();
    expect(passed.status).toBe(200);
    expect(submitResultSchema.parse(passed.body).status).toBe('submitted');
    expect(await drainTokens(SALLY)).toBe(SUBMISSIONS_PER_HOUR - 1);
  });

  it('leaves the bucket untouched when the live cap answers 422', async () => {
    const molly = await h.login(MOLLY);
    const project = await createProject(h, staff);
    for (let live = 0; live < MAX_LIVE_SUBMISSIONS; live += 1) {
      expect((await submitDocument(h, molly, project.id, GARDEN)).status).toBe(200);
    }
    const capped = await submitDocument(h, molly, project.id, GARDEN);
    expect(capped.status).toBe(422);
    expect(errorKind(capped.body)).toBe('liveCapReached');
    expect(await drainTokens(MOLLY)).toBe(SUBMISSIONS_PER_HOUR - MAX_LIVE_SUBMISSIONS);
  });

  it('leaves the bucket untouched when a save during the check answers 409', async () => {
    const kevin = await h.login(KEVIN);
    const project = await createProject(h, staff);
    const draft = await createDraft(h, kevin, project.id);
    await save(kevin, draft.id, GARDEN);
    windows.before('designs', 'submit', () => save(kevin, draft.id, SMALL_GARDEN));
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: kevin });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
    expect(await drainTokens(KEVIN)).toBe(SUBMISSIONS_PER_HOUR);
  });
});
