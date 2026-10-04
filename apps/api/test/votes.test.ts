import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defaultParameters, rankDesigns } from '@parkshape/core';

import { insightsSchema } from '../src/contracts/insights.js';
import {
  leaderboardSchema,
  myVoteSchema,
  queueSchema,
  voteResultSchema,
} from '../src/contracts/participation.js';
import { designSchema } from '../src/contracts/projects-designs.js';

import { BLANK, createDraft, createProject, submitGarden } from './fixtures.js';
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

let h: Harness;
const cookies = new Map<string, string>();

beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100',
    RATE_LIMIT_VOTES_PER_MINUTE: '100',
  });
  for (const persona of [STAFF, BOB, MOLLY, KEVIN, SALLY]) {
    cookies.set(persona, await h.login(persona));
  }
});

afterAll(async () => {
  await h.close();
});

const as = (persona: string) => cookies.get(persona) ?? '';

async function vote(persona: string, designId: string, value: 1 | -1, reasons: string[] = []) {
  return h.call('POST', '/votes', { cookie: as(persona), body: { designId, value, reasons } });
}

async function liveProject() {
  const project = await createProject(h, as(STAFF));
  const design = await submitGarden(h, as(BOB), project.id);
  return { project, design };
}

describe('voting', () => {
  it('records a vote with reasons and counts it', async () => {
    const { design } = await liveProject();
    const response = await vote(MOLLY, design.id, 1, ['trees', 'garden']);
    expect(response.status).toBe(200);
    const result = voteResultSchema.parse(response.body);
    expect(result).toMatchObject({ outcome: 'created', design: { up: 1, down: 0 } });
    expect(result.vote.reasons).toEqual(['trees', 'garden']);
  });

  it('updates the same vote instead of adding a second one', async () => {
    const { project, design } = await liveProject();
    const first = voteResultSchema.parse((await vote(MOLLY, design.id, 1)).body);
    const again = voteResultSchema.parse((await vote(MOLLY, design.id, 1, ['garden'])).body);
    expect(again.outcome).toBe('updated');
    expect(again.vote.id).toBe(first.vote.id);
    expect(again.design).toMatchObject({ up: 1, down: 0 });
    const insights = insightsSchema.parse(
      (await h.call('GET', `/projects/${project.id}/insights`, { cookie: as(STAFF) })).body,
    );
    expect(insights.headline).toEqual({ designsSubmitted: 1, uniqueVoters: 1, votesCast: 1 });
  });

  it('moves the count when a vote changes direction', async () => {
    const { design } = await liveProject();
    await vote(MOLLY, design.id, 1);
    const changed = voteResultSchema.parse(
      (await vote(MOLLY, design.id, -1, ['too-expensive'])).body,
    );
    expect(changed.design).toMatchObject({ up: 0, down: 1 });
    const stored = designSchema.parse((await h.call('GET', `/designs/${design.id}`)).body);
    expect(stored).toMatchObject({ up: 0, down: 1 });
  });

  it('returns the caller vote so they can change it, and null before they vote', async () => {
    const { design } = await liveProject();
    const before = await h.call('GET', `/designs/${design.id}/my-vote`, { cookie: as(MOLLY) });
    expect(before.status).toBe(200);
    expect(myVoteSchema.parse(before.body).vote).toBeNull();
    await vote(MOLLY, design.id, 1, ['paths', 'accessibility']);
    const after = myVoteSchema.parse(
      (await h.call('GET', `/designs/${design.id}/my-vote`, { cookie: as(MOLLY) })).body,
    );
    expect(after.vote).toMatchObject({ value: 1, reasons: ['paths', 'accessibility'] });
    expect((await h.call('GET', `/designs/${design.id}/my-vote`)).status).toBe(401);
  });
});

describe('vote guards', () => {
  it('refuses votes without a session, on your own design, on drafts and bad bodies', async () => {
    const { project, design } = await liveProject();
    const body = { designId: design.id, value: 1, reasons: [] };
    expect((await h.call('POST', '/votes', { body })).status).toBe(401);
    expect((await vote(BOB, design.id, 1)).status).toBe(403);
    const draft = await createDraft(h, as(BOB), project.id);
    expect((await vote(MOLLY, draft.id, 1)).status).toBe(404);
    const ownDraft = await createDraft(h, as(MOLLY), project.id);
    expect((await vote(MOLLY, ownDraft.id, 1)).status).toBe(403);
    const zero = { cookie: as(MOLLY), body: { ...body, value: 0 } };
    expect((await h.call('POST', '/votes', zero)).status).toBe(400);
    const badReason = { cookie: as(MOLLY), body: { ...body, reasons: ['bike-lane'] } };
    expect((await h.call('POST', '/votes', badReason)).status).toBe(400);
  });

  it('refuses votes on a superseded design', async () => {
    const { design } = await liveProject();
    await h.call('POST', `/designs/${design.id}/version`, { cookie: as(BOB) });
    const response = await vote(MOLLY, design.id, 1);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
  });

  it('locks voting once the project closes', async () => {
    const { project, design } = await liveProject();
    await h.call('PATCH', `/projects/${project.id}/status`, {
      cookie: as(STAFF),
      body: { status: 'closed' },
    });
    const response = await vote(MOLLY, design.id, 1);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
  });
});

describe('queue', () => {
  it('skips the caller own designs and ones they voted on, and hides authors', async () => {
    const project = await createProject(h, as(STAFF));
    const own = await submitGarden(h, as(MOLLY), project.id);
    const voted = await submitGarden(h, as(BOB), project.id);
    const fresh = await submitGarden(h, as(KEVIN), project.id);
    await vote(MOLLY, voted.id, 1);
    const response = await h.call('GET', `/projects/${project.id}/queue?n=5`, {
      cookie: as(MOLLY),
    });
    const { designs } = queueSchema.parse(response.body);
    expect(designs.map((design) => design.id)).toEqual([fresh.id]);
    expect(designs[0]?.author).toBeNull();
    expect(own.id).not.toBe(fresh.id);
  });

  it('serves at most n designs, never the caller own or voted ones, and varies per call', async () => {
    const project = await createProject(h, as(STAFF));
    const own = await submitGarden(h, as(SALLY), project.id);
    const voted = await submitGarden(h, as(BOB), project.id);
    const others = [
      await submitGarden(h, as(MOLLY), project.id),
      await submitGarden(h, as(MOLLY), project.id),
      await submitGarden(h, as(KEVIN), project.id),
      await submitGarden(h, as(KEVIN), project.id),
    ];
    await vote(SALLY, voted.id, 1);
    const path = `/projects/${project.id}/queue?n=2`;
    const batches = [];
    for (let call = 0; call < 4; call += 1) {
      const { designs } = queueSchema.parse(
        (await h.call('GET', path, { cookie: as(SALLY) })).body,
      );
      batches.push(designs.map((design) => design.id));
    }
    const allowed = new Set(others.map((design) => design.id));
    batches.forEach((ids) => {
      expect(ids.length).toBeLessThanOrEqual(2);
      expect(ids).not.toContain(own.id);
      expect(ids).not.toContain(voted.id);
      expect(ids.every((id) => allowed.has(id))).toBe(true);
    });
    expect(new Set(batches.map((ids) => ids.join(','))).size).toBeGreaterThan(1);
  });

  it('needs a session, a valid size and a known project', async () => {
    const project = await createProject(h, as(STAFF));
    expect((await h.call('GET', `/projects/${project.id}/queue`)).status).toBe(401);
    const tooBig = await h.call('GET', `/projects/${project.id}/queue?n=500`, {
      cookie: as(MOLLY),
    });
    expect(tooBig.status).toBe(400);
    const missing = await h.call('GET', '/projects/missing/queue', { cookie: as(MOLLY) });
    expect(missing.status).toBe(404);
  });
});

describe('queue baseline', () => {
  it('returns the baseline design id so the voter can compare with today', async () => {
    const project = await createProject(h, as(STAFF), { baselineDocument: BLANK });
    await submitGarden(h, as(KEVIN), project.id);
    const response = await h.call('GET', `/projects/${project.id}/queue?n=5`, {
      cookie: as(MOLLY),
    });
    const batch = queueSchema.parse(response.body);
    expect(batch.baselineDesignId).toBe(project.baselineDesignId);
    expect(batch.baselineDesignId).not.toBeNull();
  });
});

describe('leaderboard and insights', () => {
  it('orders designs the same way the ranking rule does', async () => {
    const project = await createProject(h, as(STAFF));
    const a = await submitGarden(h, as(BOB), project.id);
    const b = await submitGarden(h, as(MOLLY), project.id);
    const c = await submitGarden(h, as(KEVIN), project.id);
    await vote(SALLY, b.id, 1);
    await vote(BOB, b.id, 1);
    await vote(SALLY, c.id, -1);
    await vote(MOLLY, a.id, 1);
    const response = await h.call('GET', `/projects/${project.id}/leaderboard`, {
      cookie: as(SALLY),
    });
    const { entries } = leaderboardSchema.parse(response.body);
    const rows = await h.deps.repos.designs.listByProject(project.id, 'submitted');
    const expected = rankDesigns(rows, { up: 2, down: 2 });
    expect(entries.map((entry) => entry.design.id)).toEqual(expected.map((entry) => entry.id));
    expect(entries.map((entry) => entry.score)).toEqual(expected.map((entry) => entry.score));
    expect(entries.map((entry) => entry.design.id)).toEqual([b.id, a.id, c.id]);
    const authors = new Map(entries.map((entry) => [entry.design.id, entry.design.author]));
    expect(authors.get(b.id)).toEqual({ id: MOLLY, displayName: 'Molly Swingset' });
    expect(authors.get(a.id)).toBeNull();
  });

  it('ranks with the project scoring prior', async () => {
    const scoringPrior = { up: 1, down: 9 };
    const parameters = { ...defaultParameters(), scoringPrior };
    const project = await createProject(h, as(STAFF), { parameters });
    const a = await submitGarden(h, as(BOB), project.id);
    const b = await submitGarden(h, as(MOLLY), project.id);
    await vote(SALLY, a.id, 1);
    await vote(KEVIN, b.id, -1);
    const response = await h.call('GET', `/projects/${project.id}/leaderboard`);
    const { entries } = leaderboardSchema.parse(response.body);
    const rows = await h.deps.repos.designs.listByProject(project.id, 'submitted');
    const expected = rankDesigns(rows, scoringPrior);
    expect(entries.map((entry) => [entry.rank, entry.design.id, entry.score])).toEqual(
      expected.map((entry, index) => [index + 1, entry.id, entry.score]),
    );
    expect(entries[0]?.score).toBe(2 / 11);
  });

  it('returns the scoring prior so the tooltip can explain the order', async () => {
    const scoringPrior = { up: 3, down: 7 };
    const parameters = { ...defaultParameters(), scoringPrior };
    const project = await createProject(h, as(STAFF), { parameters });
    await submitGarden(h, as(BOB), project.id);
    const response = await h.call('GET', `/projects/${project.id}/leaderboard`);
    expect(leaderboardSchema.parse(response.body).prior).toEqual(scoringPrior);
  });

  it('works without a session, revealing no authors', async () => {
    const { project } = await liveProject();
    const response = await h.call('GET', `/projects/${project.id}/leaderboard`);
    const { entries } = leaderboardSchema.parse(response.body);
    expect(entries[0]?.design.author).toBeNull();
    expect((await h.call('GET', '/projects/missing/leaderboard')).status).toBe(404);
    expect((await h.call('GET', '/projects/missing/insights')).status).toBe(401);
  });
});
