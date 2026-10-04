import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { VOTE_COMMENT_MAX_CHARS } from '@parkshape/core';

import { errorBodySchema } from '../src/contracts/common.js';
import { insightsSchema } from '../src/contracts/insights.js';
import {
  myVoteSchema,
  voteResultSchema,
  withdrawResultSchema,
} from '../src/contracts/participation.js';
import { designSchema } from '../src/contracts/projects-designs.js';

import { createDraft, createProject, submitGarden } from './fixtures.js';
import {
  BOB,
  KEVIN,
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

interface VoteChange {
  readonly value: 1 | -1;
  readonly reasons?: readonly string[];
  readonly comment?: string | null;
}

function setVote(persona: string, designId: string, change: VoteChange) {
  const body = { reasons: [], ...change };
  return h.call('PUT', `/designs/${designId}/my-vote`, { cookie: as(persona), body });
}

function withdraw(persona: string, designId: string) {
  return h.call('DELETE', `/designs/${designId}/my-vote`, { cookie: as(persona) });
}

async function myVote(persona: string, designId: string) {
  const response = await h.call('GET', `/designs/${designId}/my-vote`, { cookie: as(persona) });
  return myVoteSchema.parse(response.body).vote;
}

async function counts(designId: string) {
  const { up, down } = designSchema.parse((await h.call('GET', `/designs/${designId}`)).body);
  return { up, down };
}

async function liveDesign() {
  const project = await createProject(h, as(STAFF));
  const design = await submitGarden(h, as(BOB), project.id);
  return { project, design };
}

describe('changing a vote', () => {
  it('creates the vote on the first PUT and changes its direction on the next', async () => {
    const { design } = await liveDesign();
    const first = voteResultSchema.parse((await setVote(MOLLY, design.id, { value: 1 })).body);
    expect(first).toMatchObject({ outcome: 'created', design: { up: 1, down: 0 } });
    const changed = await setVote(MOLLY, design.id, { value: -1, reasons: ['too-paved'] });
    expect(changed.status).toBe(200);
    const result = voteResultSchema.parse(changed.body);
    expect(result).toMatchObject({ outcome: 'updated', design: { up: 0, down: 1 } });
    expect(result.vote).toMatchObject({ id: first.vote.id, value: -1, reasons: ['too-paved'] });
    expect(await counts(design.id)).toEqual({ up: 0, down: 1 });
  });

  it('edits only the reasons and leaves the counters where they were', async () => {
    const { design } = await liveDesign();
    await setVote(MOLLY, design.id, { value: 1, reasons: ['trees'] });
    await setVote(KEVIN, design.id, { value: -1 });
    const edited = voteResultSchema.parse(
      (await setVote(MOLLY, design.id, { value: 1, reasons: ['paths', 'water'] })).body,
    );
    expect(edited.design).toMatchObject({ up: 1, down: 1 });
    expect((await myVote(MOLLY, design.id))?.reasons).toEqual(['paths', 'water']);
    expect(await counts(design.id)).toEqual({ up: 1, down: 1 });
  });
});

describe('withdrawing a vote', () => {
  it('removes the vote and takes it off the counter', async () => {
    const { design } = await liveDesign();
    await setVote(MOLLY, design.id, { value: 1, comment: 'Good shade.' });
    await setVote(KEVIN, design.id, { value: 1 });
    const response = await withdraw(MOLLY, design.id);
    expect(response.status).toBe(200);
    expect(withdrawResultSchema.parse(response.body)).toEqual({
      outcome: 'withdrawn',
      design: { id: design.id, up: 1, down: 0 },
    });
    expect(await myVote(MOLLY, design.id)).toBeNull();
    expect(await counts(design.id)).toEqual({ up: 1, down: 0 });
  });

  it('answers absent and moves nothing when there is no vote', async () => {
    const { design } = await liveDesign();
    const response = await withdraw(MOLLY, design.id);
    expect(withdrawResultSchema.parse(response.body)).toEqual({
      outcome: 'absent',
      design: { id: design.id, up: 0, down: 0 },
    });
  });

  it('puts the design back in the queue so the person can vote on it again', async () => {
    const { project, design } = await liveDesign();
    await setVote(MOLLY, design.id, { value: -1 });
    const before = await h.call('GET', `/projects/${project.id}/queue?n=5`, { cookie: as(MOLLY) });
    expect(JSON.stringify(before.body)).not.toContain(design.id);
    expect((await withdraw(MOLLY, design.id)).status).toBe(200);
    const queue = await h.call('GET', `/projects/${project.id}/queue?n=5`, { cookie: as(MOLLY) });
    expect(JSON.stringify(queue.body)).toContain(design.id);
  });
});

describe('vote comments', () => {
  it('stores a trimmed comment and returns it to the voter', async () => {
    const { design } = await liveDesign();
    const response = await setVote(MOLLY, design.id, {
      value: 1,
      comment: '  Keep the garden plots by the lane.  ',
    });
    expect(voteResultSchema.parse(response.body).vote.comment).toBe(
      'Keep the garden plots by the lane.',
    );
    expect((await myVote(MOLLY, design.id))?.comment).toBe('Keep the garden plots by the lane.');
  });

  it('takes a comment of exactly the cap and refuses one character more', async () => {
    const { design } = await liveDesign();
    const longest = 'a'.repeat(VOTE_COMMENT_MAX_CHARS);
    expect((await setVote(MOLLY, design.id, { value: 1, comment: longest })).status).toBe(200);
    const tooLong = await setVote(MOLLY, design.id, { value: 1, comment: `${longest}a` });
    expect(tooLong.status).toBe(400);
    expect((await myVote(MOLLY, design.id))?.comment).toBe(longest);
  });

  it('refuses HTML and stores a blank comment as none', async () => {
    const { design } = await liveDesign();
    const html = await setVote(MOLLY, design.id, { value: 1, comment: '<b>Shade</b>' });
    expect(html.status).toBe(400);
    expect(errorKind(html.body)).toBe('validation');
    await setVote(MOLLY, design.id, { value: 1, comment: '   ' });
    expect((await myVote(MOLLY, design.id))?.comment).toBeNull();
  });
});

describe('vote comments elsewhere', () => {
  it('keeps the comment when POST /votes sends one, and has none when it does not', async () => {
    const { design } = await liveDesign();
    const body = { designId: design.id, value: 1, reasons: [], comment: 'Room to run.' };
    const posted = await h.call('POST', '/votes', { cookie: as(SALLY), body });
    expect(voteResultSchema.parse(posted.body).vote.comment).toBe('Room to run.');
    const bare = { designId: design.id, value: -1, reasons: [] };
    const plain = await h.call('POST', '/votes', { cookie: as(KEVIN), body: bare });
    expect(voteResultSchema.parse(plain.body).vote.comment).toBeNull();
  });

  it('lists each comment under its design for planners, with the voter name and a count', async () => {
    const { project, design } = await liveDesign();
    await setVote(MOLLY, design.id, { value: 1, comment: 'More benches near the gate.' });
    await setVote(KEVIN, design.id, { value: -1 });
    const response = await h.call('GET', `/projects/${project.id}/insights`, { cookie: as(STAFF) });
    const { comments } = insightsSchema.parse(response.body);
    expect(comments.total).toBe(1);
    expect(comments.byDesign).toEqual([
      {
        designId: design.id,
        title: design.title,
        comments: [
          expect.objectContaining({
            displayName: 'Molly Swingset',
            text: 'More benches near the gate.',
          }),
        ],
      },
    ]);
  });
});

describe('vote change guards', () => {
  it('answers 404 alike for an unknown design and a draft the voter may not see', async () => {
    const { project } = await liveDesign();
    const draft = await createDraft(h, as(BOB), project.id);
    const answers = [];
    for (const id of ['missing', draft.id]) {
      answers.push(await setVote(MOLLY, id, { value: 1 }), await withdraw(MOLLY, id));
    }
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
    const errors = answers.map((answer) => {
      const { kind, message } = errorBodySchema.parse(answer.body).error;
      return { kind, message };
    });
    expect(new Set(errors.map((error) => JSON.stringify(error))).size).toBe(1);
  });

  it('needs a session and refuses a vote on your own design', async () => {
    const { design } = await liveDesign();
    const anonymous = await h.call('PUT', `/designs/${design.id}/my-vote`, {
      body: { value: 1, reasons: [] },
    });
    expect(anonymous.status).toBe(401);
    expect((await h.call('DELETE', `/designs/${design.id}/my-vote`)).status).toBe(401);
    expect((await setVote(BOB, design.id, { value: 1 })).status).toBe(403);
    expect((await withdraw(BOB, design.id)).status).toBe(403);
  });

  it('locks changes and withdraws once the project closes, and keeps the vote', async () => {
    const { project, design } = await liveDesign();
    await setVote(MOLLY, design.id, { value: 1, comment: 'Before close.' });
    await h.call('PATCH', `/projects/${project.id}/status`, {
      cookie: as(STAFF),
      body: { status: 'closed' },
    });
    const changed = await setVote(MOLLY, design.id, { value: -1 });
    const removed = await withdraw(MOLLY, design.id);
    expect([changed.status, removed.status]).toEqual([409, 409]);
    expect([errorKind(changed.body), errorKind(removed.body)]).toEqual([
      'phase-closed',
      'phase-closed',
    ]);
    expect(await myVote(MOLLY, design.id)).toMatchObject({ value: 1, comment: 'Before close.' });
    expect(await counts(design.id)).toEqual({ up: 1, down: 0 });
  });
});
