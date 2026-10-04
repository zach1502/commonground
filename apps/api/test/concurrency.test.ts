import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_LIVE_SUBMISSIONS, defaultParameters, rankDesigns } from '@parkshape/core';

import { leaderboardSchema } from '../src/contracts/participation.js';

import { BENCH_ID, REVIEWABLE, submitAs } from './element-comment-world.js';
import { createDraft, createProject, submitGarden, GARDEN } from './fixtures.js';
import { STAFF, errorKind, startHarness, type Harness } from './harness.js';

// Many phones in one room: each test fires its requests together with Promise.all, so the
// database sees them at the same time, as it does in a demo.
const VOTE_LIMIT = 30;
const VOTERS = 12;
const LIVE_DESIGNS = 4;
const PARALLEL_SUBMITS = 5;
const BURST_OVER_LIMIT = 5;
const HTTP_OK = 200;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const HTTP_CREATED = 201;
const PARALLEL_COMMENTS = 20;
const BENCH_SPACING_M = 4;

let h: Harness;
let staff: string;

beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100',
    RATE_LIMIT_VOTES_PER_MINUTE: String(VOTE_LIMIT),
    RATE_LIMIT_COMMENTS_PER_MINUTE: '1000',
  });
  staff = await h.login(STAFF);
});

afterAll(async () => {
  await h.close();
});

let residentCount = 0;

/** A resident who is not a sign-in persona, made the way the seed makes its residents. */
async function newResident(): Promise<{ readonly id: string; readonly cookie: string }> {
  residentCount += 1;
  const id = `race-resident-${String(residentCount).padStart(2, '0')}`;
  await h.deps.repos.users.upsert({ id, displayName: `Race ${id}`, role: 'resident' });
  const { setCookie } = await h.deps.auth.createSession(id, 'resident');
  return { id, cookie: setCookie.split(';')[0] ?? '' };
}

async function newCookie(): Promise<string> {
  return (await newResident()).cookie;
}

function vote(cookie: string, designId: string, value: 1 | -1) {
  return h.call('POST', '/votes', { cookie, body: { designId, value, reasons: [] } });
}

async function liveDesigns(projectId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push((await submitGarden(h, await newCookie(), projectId)).id);
  }
  return ids;
}

/** Every resident votes on every design at once, and flips some of those votes in the same burst. */
async function voteStorm(designIds: readonly string[]) {
  const voters = await Promise.all(Array.from({ length: VOTERS }, () => newCookie()));
  const requests = voters.flatMap((cookie, voter) =>
    designIds.flatMap((designId, index) => {
      const value = (voter + index) % 2 === 0 ? 1 : -1;
      const change = vote(cookie, designId, value === 1 ? -1 : 1);
      return voter % 3 === 0
        ? [vote(cookie, designId, value), change]
        : [vote(cookie, designId, value)];
    }),
  );
  return Promise.all(requests);
}

describe('concurrent votes', () => {
  it('keeps every design counter equal to the votes table', async () => {
    const project = await createProject(h, staff);
    const designIds = await liveDesigns(project.id, LIVE_DESIGNS);
    const responses = await voteStorm(designIds);
    expect(responses.map((response) => response.status).filter((s) => s !== HTTP_OK)).toEqual([]);
    const votes = await h.deps.repos.votes.listByProject(project.id);
    for (const id of designIds) {
      const design = await h.deps.repos.designs.findById(id);
      const mine = votes.filter((row) => row.designId === id);
      expect({ up: design?.up, down: design?.down }).toEqual({
        up: mine.filter((row) => row.value === 1).length,
        down: mine.filter((row) => row.value === -1).length,
      });
    }
    const pairs = votes.map((row) => `${row.userId}/${row.designId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('ranks the leaderboard as rankDesigns does over the votes table', async () => {
    const project = await createProject(h, staff);
    const designIds = await liveDesigns(project.id, LIVE_DESIGNS);
    await voteStorm(designIds);
    const votes = await h.deps.repos.votes.listByProject(project.id);
    const recounted = designIds.map((id) => ({
      id,
      up: votes.filter((row) => row.designId === id && row.value === 1).length,
      down: votes.filter((row) => row.designId === id && row.value === -1).length,
      submittedAt: null,
    }));
    const live = await h.deps.repos.designs.listByProject(project.id, 'submitted');
    const expected = rankDesigns(
      live.map((design) => ({ ...design, ...recounted.find((row) => row.id === design.id) })),
      defaultParameters().scoringPrior,
    ).map((design) => design.id);
    const board = leaderboardSchema.parse(
      (await h.call('GET', `/projects/${project.id}/leaderboard`, { cookie: staff })).body,
    );
    expect(board.entries.map((entry) => entry.design.id)).toEqual(expected);
  });
});

describe('concurrent submits', () => {
  it('holds the three-live cap when one author submits five drafts at once', async () => {
    const project = await createProject(h, staff);
    const { id: authorId, cookie: author } = await newResident();
    const drafts: string[] = [];
    for (let index = 0; index < PARALLEL_SUBMITS; index += 1) {
      const draft = await createDraft(h, author, project.id);
      const body = { title: 'Garden corner', blurb: 'Beds by the lane.', document: GARDEN };
      await h.call('PUT', `/designs/${draft.id}`, { cookie: author, body });
      drafts.push(draft.id);
    }
    const responses = await Promise.all(
      drafts.map((id) => h.call('POST', `/designs/${id}/submit`, { cookie: author })),
    );
    const statuses = responses.map((response) => response.status).sort();
    const refused = PARALLEL_SUBMITS - MAX_LIVE_SUBMISSIONS;
    expect(statuses).toEqual([
      ...Array<number>(MAX_LIVE_SUBMISSIONS).fill(HTTP_OK),
      ...Array<number>(refused).fill(HTTP_UNPROCESSABLE),
    ]);
    const kinds = responses.filter((r) => r.status !== HTTP_OK).map((r) => errorKind(r.body));
    expect(kinds).toEqual(Array<string>(refused).fill('liveCapReached'));
    const live = await h.deps.repos.designs.countByAuthor(project.id, authorId, 'submitted');
    expect(live).toBe(MAX_LIVE_SUBMISSIONS);
  });
});

describe('vote limiter under a burst', () => {
  it('refuses exactly the votes past the per-minute limit', async () => {
    const project = await createProject(h, staff);
    const [designId = ''] = await liveDesigns(project.id, 1);
    const cookie = await newCookie();
    const responses = await Promise.all(
      Array.from({ length: VOTE_LIMIT + BURST_OVER_LIMIT }, (_, index) =>
        vote(cookie, designId, index % 2 === 0 ? 1 : -1),
      ),
    );
    const refused = responses.filter((response) => response.status === HTTP_TOO_MANY);
    expect(refused).toHaveLength(BURST_OVER_LIMIT);
    expect(responses.filter((response) => response.status === HTTP_OK)).toHaveLength(VOTE_LIMIT);
    const votes = await h.deps.repos.votes.listByProject(project.id);
    expect(votes).toHaveLength(1);
    const design = await h.deps.repos.designs.findById(designId);
    expect((design?.up ?? 0) + (design?.down ?? 0)).toBe(1);
  });
});

/** The reviewable design with a row of benches, one per parallel comment. */
const BENCH_ROW = {
  ...REVIEWABLE,
  items: Array.from({ length: PARALLEL_COMMENTS }, (_, index) => ({
    id: `bench-row-${String(index)}`,
    catalogId: 'bench',
    position: { x: 30 + index * BENCH_SPACING_M, y: 90 },
    rotationDeg: 0,
    locked: false,
  })),
};

function comment(cookie: string, designId: string, body: Record<string, unknown>) {
  return h.call('POST', `/designs/${designId}/comments`, { cookie, body });
}

async function commentsOn(designId: string) {
  return h.deps.repos.elementComments.listByDesign(designId, { hidden: 'include' });
}

describe('concurrent element comments', () => {
  it('lands both comments when two residents comment on one element at once', async () => {
    const project = await createProject(h, staff);
    const designId = await submitAs(h, await newCookie(), project.id, REVIEWABLE);
    const [first, second] = await Promise.all([newCookie(), newCookie()]);
    const body = { elementId: BENCH_ID, kind: 'move', text: 'Face the swings' };
    const responses = await Promise.all([
      comment(first, designId, body),
      comment(second, designId, body),
    ]);
    expect(responses.map((response) => response.status)).toEqual([HTTP_CREATED, HTTP_CREATED]);
    expect(await commentsOn(designId)).toHaveLength(2);
  });

  it('keeps one row when one person sends the same comment 20 times at once', async () => {
    const project = await createProject(h, staff);
    const designId = await submitAs(h, await newCookie(), project.id, REVIEWABLE);
    const cookie = await newCookie();
    const responses = await Promise.all(
      Array.from({ length: PARALLEL_COMMENTS }, (_, index) =>
        comment(cookie, designId, {
          elementId: BENCH_ID,
          kind: 'move',
          text: `Try ${String(index)}`,
        }),
      ),
    );
    const outcomes = responses.map((response) => (response.body as { outcome?: string }).outcome);
    expect(outcomes.filter((outcome) => outcome === 'created')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'updated')).toHaveLength(PARALLEL_COMMENTS - 1);
    expect(await commentsOn(designId)).toHaveLength(1);
  });

  it('keeps all 20 rows when one person comments on 20 elements at once', async () => {
    const project = await createProject(h, staff);
    const designId = await submitAs(h, await newCookie(), project.id, BENCH_ROW);
    const cookie = await newCookie();
    const responses = await Promise.all(
      BENCH_ROW.items.map((item) =>
        comment(cookie, designId, { elementId: item.id, kind: 'keep' }),
      ),
    );
    expect(responses.filter((response) => response.status === HTTP_CREATED)).toHaveLength(
      PARALLEL_COMMENTS,
    );
    expect(await commentsOn(designId)).toHaveLength(PARALLEL_COMMENTS);
  });
});
