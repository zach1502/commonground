import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { intentSchema, summarySchema } from '@parkshape/ai';

import { designSchema } from '../src/contracts/projects-designs.js';

import { createProject, submitGarden } from './fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const DOG_PARK =
  'a dog park in the back corner, a pond on the low side, a loop path, lots of trees';
const MAX_TEXT = 400;

async function signIn(h: Harness) {
  return {
    staff: await h.login(STAFF),
    bob: await h.login(BOB),
    molly: await h.login(MOLLY),
  };
}

let h: Harness;
let as: Awaited<ReturnType<typeof signIn>>;
let projectId: string;
let gardenId: string;

// One API with the default rule-based provider and one live design, shared by the first two blocks.
beforeAll(async () => {
  h = await startHarness();
  as = await signIn(h);
  projectId = (await createProject(h, as.staff)).id;
  gardenId = (await submitGarden(h, as.bob, projectId)).id;
});

afterAll(async () => {
  await h.close();
});

describe('GET /projects/:id/summary with the rule-based provider', () => {
  it('summarizes the top designs for staff', async () => {
    const response = await h.call('GET', `/projects/${projectId}/summary`, { cookie: as.staff });
    expect(response.status).toBe(200);
    const { source, designsRead, ...summary } = response.body as {
      source: string;
      designsRead: number;
    };
    expect(summarySchema.parse(summary).themes).toContainEqual(
      expect.objectContaining({ label: 'A community garden', designCount: 1 }),
    );
    // The page notes when the rule-based provider wrote the summary, and how many designs it read.
    expect(source).toBe('rule-based');
    expect(designsRead).toBe(1);
  });

  it('hands the summary provider the reason totals from every vote in the project', async () => {
    const vote = { designId: gardenId, value: 1, reasons: ['garden', 'trees'] };
    await h.call('POST', '/votes', { cookie: as.molly, body: vote });
    const summarize = vi.spyOn(h.deps.ai.summary, 'summarize');
    await h.call('GET', `/projects/${projectId}/summary`, { cookie: as.staff });
    expect(summarize.mock.calls[0]?.[0].reasonCounts).toMatchObject({ garden: 1, trees: 1 });
    summarize.mockRestore();
  });

  it('keeps the summary from residents and signed-out callers', async () => {
    const path = `/projects/${projectId}/summary`;
    expect((await h.call('GET', path, { cookie: as.molly })).status).toBe(403);
    expect((await h.call('GET', path)).status).toBe(401);
  });

  it('returns 404 for the summary of a project that does not exist', async () => {
    const response = await h.call('GET', '/projects/nope/summary', { cookie: as.staff });
    expect(response.status).toBe(404);
  });
});

describe('POST /projects/:id/intent with the rule-based provider', () => {
  it('reads a resident description into an intent', async () => {
    const response = await h.call('POST', `/projects/${projectId}/intent`, {
      cookie: as.molly,
      body: { text: DOG_PARK },
    });
    expect(response.status).toBe(200);
    const intent = intentSchema.parse(response.body);
    expect(intent.features[0]).toMatchObject({
      category: 'dog',
      placement: { zone: 'south-east' },
    });
    expect(intent).toMatchObject({ paths: { style: 'loop' }, canopy: 'maximize' });
  });

  it('refuses descriptions over 400 characters and empty ones', async () => {
    const path = `/projects/${projectId}/intent`;
    const long = await h.call('POST', path, {
      cookie: as.molly,
      body: { text: 'a'.repeat(MAX_TEXT + 1) },
    });
    expect(long.status).toBe(400);
    expect(errorKind(long.body)).toBe('validation');
    const empty = await h.call('POST', path, { cookie: as.molly, body: { text: '   ' } });
    expect(empty.status).toBe(400);
  });

  it('asks signed-out callers to sign in before reading a description', async () => {
    const response = await h.call('POST', `/projects/${projectId}/intent`, {
      body: { text: 'a pond' },
    });
    expect(response.status).toBe(401);
  });
});

describe('AI routes with the flags off', () => {
  let other: Harness;
  let people: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    other = await startHarness({ FEATURE_SUMMARY: 'false', FEATURE_DESCRIBE_IT: 'false' });
    people = await signIn(other);
  });

  afterAll(async () => {
    await other.close();
  });

  it('returns 503 feature-off for the summary and the intent', async () => {
    const otherId = (await createProject(other, people.staff)).id;
    const summary = await other.call('GET', `/projects/${otherId}/summary`, {
      cookie: people.staff,
    });
    expect(summary.status).toBe(503);
    expect(errorKind(summary.body)).toBe('feature-off');
    const intent = await other.call('POST', `/projects/${otherId}/intent`, {
      cookie: people.molly,
      body: { text: 'a pond' },
    });
    expect(intent.status).toBe(503);
    expect(errorKind(intent.body)).toBe('feature-off');
  });
});

describe('AI routes with the fake model client', () => {
  let other: Harness;
  let people: Awaited<ReturnType<typeof signIn>>;

  beforeAll(async () => {
    other = await startHarness({ AI_PROVIDER: 'fake' });
    people = await signIn(other);
  });

  afterAll(async () => {
    await other.close();
  });

  it('returns the canned answers', async () => {
    const otherId = (await createProject(other, people.staff)).id;
    const summary = await other.call('GET', `/projects/${otherId}/summary`, {
      cookie: people.staff,
    });
    // The page names the model that wrote the summary; the fake client calls itself fake-model.
    expect(summary.body).toEqual({
      themes: [],
      tradeoffs: [],
      source: 'model',
      model: 'fake-model',
      designsRead: 0,
    });
    const intent = await other.call('POST', `/projects/${otherId}/intent`, {
      cookie: people.molly,
      body: { text: 'anything at all' },
    });
    expect(intentSchema.parse(intent.body).canopy).toBe('maximize');
  });

  it('records the model that read a Describe it description', { timeout: 60_000 }, async () => {
    const otherId = (await createProject(other, people.staff)).id;
    const response = await other.call('POST', `/projects/${otherId}/designs`, {
      cookie: people.molly,
      body: { from: 'describe', text: 'anything at all', seed: 3 },
    });
    expect(response.status).toBe(201);
    expect(designSchema.parse(response.body).document.generated).toMatchObject({
      source: 'model',
      model: 'fake-model',
    });
  });
});

describe('AI routes when the model call fails', () => {
  let other: Harness;
  let people: Awaited<ReturnType<typeof signIn>>;

  // Offline mode makes every model call fail, so each answer comes from the rules.
  beforeAll(async () => {
    other = await startHarness({
      AI_PROVIDER: 'openai-compatible',
      AI_API_KEY: 'test-key',
      PARKSHAPE_OFFLINE: '1',
    });
    people = await signIn(other);
  });

  afterAll(async () => {
    await other.close();
  });

  it('says the rules wrote the summary, not the model', async () => {
    const otherId = (await createProject(other, people.staff)).id;
    const summary = await other.call('GET', `/projects/${otherId}/summary`, {
      cookie: people.staff,
    });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ source: 'rule-based' });
    expect(summary.body).not.toHaveProperty('model');
  });

  it('says the rules read a Describe it description', { timeout: 60_000 }, async () => {
    const otherId = (await createProject(other, people.staff)).id;
    const response = await other.call('POST', `/projects/${otherId}/designs`, {
      cookie: people.molly,
      body: { from: 'describe', text: DOG_PARK, seed: 3 },
    });
    expect(response.status).toBe(201);
    const { generated } = designSchema.parse(response.body).document;
    expect(generated).toMatchObject({ source: 'rule-based' });
    expect(generated).not.toHaveProperty('model');
  });
});
