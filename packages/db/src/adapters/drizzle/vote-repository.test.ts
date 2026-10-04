import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FakeClock, VOTE_COMMENT_MAX_CHARS } from '@parkshape/core';

import { seedDraft, seedProject, seedUser, uncapped } from '../../ports/__contracts__/fixtures.js';
import { openTestDatabase } from '../../testing/test-database.js';
import { PostgresRateLimitStore } from '../rate-limit/postgres-rate-limit-store.js';

import type { OpenDatabase } from './pglite.js';

import { createDrizzleRepositories } from './index.js';

// Starting pglite under a full parallel run takes well over the 10 s hook default.
const START_TIMEOUT_MS = 60_000;

let connection: OpenDatabase;

beforeAll(async () => {
  connection = await openTestDatabase();
}, START_TIMEOUT_MS);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await connection.close();
});

async function votingWorld() {
  const { db } = connection;
  await db.execute(sql`truncate element_comments, votes, designs, projects, users`);
  let next = 0;
  const repos = createDrizzleRepositories(db, {
    clock: new FakeClock(new Date('2026-09-25T09:00:00.000Z')),
    newId: () => `id-${String((next += 1))}`,
  });
  const author = await seedUser(repos, 'author');
  const voter = await seedUser(repos, 'voter');
  const project = await seedProject(repos);
  const design = await seedDraft(repos, project.id, author.id);
  await repos.designs.submit(design.id, uncapped({}));
  return { db, repos, voter, design };
}

describe('DrizzleVoteRepository.upsertVote', () => {
  it('writes a first vote and its counters in one statement with no transaction', async () => {
    const { db, repos, voter, design } = await votingWorld();
    const transaction = vi.spyOn(db, 'transaction');
    const execute = vi.spyOn(db, 'execute');
    await repos.votes.upsertVote({ userId: voter.id, designId: design.id, value: 1, reasons: [] });
    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('changes a vote in one statement with no transaction', async () => {
    const { db, repos, voter, design } = await votingWorld();
    await repos.votes.upsertVote({ userId: voter.id, designId: design.id, value: 1, reasons: [] });
    const transaction = vi.spyOn(db, 'transaction');
    const execute = vi.spyOn(db, 'execute');
    const changed = await repos.votes.upsertVote({
      userId: voter.id,
      designId: design.id,
      value: -1,
      reasons: ['cost'],
    });
    expect(changed).toMatchObject({ outcome: 'updated', counts: { up: 0, down: 1 } });
    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('DrizzleVoteRepository.withdrawVote', () => {
  it('removes a vote and its counter in one statement with no transaction', async () => {
    const { db, repos, voter, design } = await votingWorld();
    await repos.votes.upsertVote({ userId: voter.id, designId: design.id, value: -1, reasons: [] });
    const transaction = vi.spyOn(db, 'transaction');
    const execute = vi.spyOn(db, 'execute');
    const withdrawn = await repos.votes.withdrawVote({ userId: voter.id, designId: design.id });
    expect(withdrawn).toEqual({ outcome: 'withdrawn', counts: { up: 0, down: 0 } });
    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('the votes comment column', () => {
  it('refuses a comment longer than the cap', async () => {
    const { repos, voter, design } = await votingWorld();
    const cast = { userId: voter.id, designId: design.id, value: 1, reasons: [] } as const;
    const longest = 'a'.repeat(VOTE_COMMENT_MAX_CHARS);
    expect((await repos.votes.upsertVote({ ...cast, comment: longest })).vote.comment).toBe(
      longest,
    );
    await expect(repos.votes.upsertVote({ ...cast, comment: `${longest}a` })).rejects.toThrow();
  });
});

describe('queries on the vote path', () => {
  it('builds the vote target query once and reuses it', async () => {
    const { db, repos, design } = await votingWorld();
    const select = vi.spyOn(db, 'select');
    const first = await repos.designs.findVoteTarget(design.id);
    const second = await repos.designs.findVoteTarget(design.id);
    expect(second).toEqual(first);
    expect(first?.design.id).toBe(design.id);
    expect(await repos.designs.findVoteTarget('missing')).toBeUndefined();
    expect(select.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('builds the rate limit take once and reuses it', async () => {
    const { db } = connection;
    await db.execute(sql`truncate rate_limit_buckets`);
    const insert = vi.spyOn(db, 'insert');
    const store = new PostgresRateLimitStore(db);
    const options = { capacity: 2, windowMs: 60_000, nowMs: 1000 };
    const answers = [];
    for (let index = 0; index < 3; index += 1) answers.push(await store.take('k', options));
    expect(answers.map((answer) => answer.kind)).toEqual(['allowed', 'allowed', 'limited']);
    expect(insert.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
