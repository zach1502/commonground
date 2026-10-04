import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  COMMENT_KINDS,
  ELEMENT_COMMENT_MAX_CHARS,
  FakeClock,
  PLANNER_REPLY_MAX_CHARS,
  commentStatusSchema,
  elementKindSchema,
} from '@parkshape/core';

import { seedDraft, seedProject, seedUser, uncapped } from '../../ports/__contracts__/fixtures.js';
import type { OpenComment } from '../../ports/element-comment-repository.js';
import { openTestDatabase } from '../../testing/test-database.js';

import type { OpenDatabase } from './pglite.js';
import {
  ELEMENT_COMMENT_TEXT_MAX_CHARS,
  PLANNER_REPLY_TEXT_MAX_CHARS,
  STORED_COMMENT_KINDS,
  STORED_COMMENT_STATUSES,
  STORED_ELEMENT_KINDS,
} from './schema/element-comments.js';

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

async function commentWorld() {
  const { db } = connection;
  await db.execute(sql`truncate element_comments, votes, designs, projects, users`);
  let next = 0;
  const repos = createDrizzleRepositories(db, {
    clock: new FakeClock(new Date('2026-09-25T09:00:00.000Z')),
    newId: () => `id-${String((next += 1))}`,
  });
  const author = await seedUser(repos, 'author');
  const resident = await seedUser(repos, 'resident');
  const project = await seedProject(repos);
  const design = await seedDraft(repos, project.id, author.id);
  await repos.designs.submit(design.id, uncapped({}));
  const bench: OpenComment = {
    designId: design.id,
    authorId: resident.id,
    elementId: 'bench-1',
    elementKind: 'item',
    category: 'seating',
    kind: 'move',
    text: 'Face the playground',
  };
  return { db, repos, bench };
}

describe('DrizzleElementCommentRepository.upsertOpen', () => {
  it('writes a first comment in one statement with no transaction', async () => {
    const { db, repos, bench } = await commentWorld();
    const transaction = vi.spyOn(db, 'transaction');
    const execute = vi.spyOn(db, 'execute');
    expect((await repos.elementComments.upsertOpen(bench)).outcome).toBe('created');
    expect(transaction).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('replaces the text of an open comment in one statement', async () => {
    const { db, repos, bench } = await commentWorld();
    await repos.elementComments.upsertOpen(bench);
    const execute = vi.spyOn(db, 'execute');
    const again = await repos.elementComments.upsertOpen({ ...bench, text: 'Face south' });
    expect(again).toMatchObject({ outcome: 'updated', comment: { text: 'Face south' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown author as a missing reference', async () => {
    const { repos, bench } = await commentWorld();
    await expect(
      repos.elementComments.upsertOpen({ ...bench, authorId: 'nobody' }),
    ).rejects.toMatchObject({ kind: 'missing-reference', reference: 'user nobody' });
  });

  it('lands both of two parallel comments by different people on one element', async () => {
    const { repos, bench } = await commentWorld();
    await seedUser(repos, 'neighbour');
    const results = await Promise.all([
      repos.elementComments.upsertOpen(bench),
      repos.elementComments.upsertOpen({ ...bench, authorId: 'neighbour' }),
    ]);
    expect(results.map((result) => result.outcome)).toEqual(['created', 'created']);
    const listed = await repos.elementComments.listByDesign(bench.designId, { hidden: 'include' });
    expect(listed).toHaveLength(2);
  });

  it('keeps one row for parallel comments by one person of one kind', async () => {
    const { repos, bench } = await commentWorld();
    const texts = ['one', 'two', 'three', 'four'];
    await Promise.all(texts.map((text) => repos.elementComments.upsertOpen({ ...bench, text })));
    const listed = await repos.elementComments.listByDesign(bench.designId, { hidden: 'include' });
    expect(listed).toHaveLength(1);
  });
});

describe('the element_comments table', () => {
  it('holds the caps and lists core holds', () => {
    expect(ELEMENT_COMMENT_TEXT_MAX_CHARS).toBe(ELEMENT_COMMENT_MAX_CHARS);
    expect(PLANNER_REPLY_TEXT_MAX_CHARS).toBe(PLANNER_REPLY_MAX_CHARS);
    expect(STORED_COMMENT_KINDS).toEqual(COMMENT_KINDS);
    expect(STORED_COMMENT_STATUSES).toEqual(commentStatusSchema.options);
    expect(STORED_ELEMENT_KINDS).toEqual(elementKindSchema.options);
  });

  it('refuses text over the cap even when the service is bypassed', async () => {
    const { db, repos, bench } = await commentWorld();
    const { comment } = await repos.elementComments.upsertOpen(bench);
    const tooLong = 'a'.repeat(ELEMENT_COMMENT_MAX_CHARS + 1);
    await expect(
      db.execute(sql`update element_comments set text = ${tooLong} where id = ${comment.id}`),
    ).rejects.toThrow();
  });

  it('refuses a comment kind, status or element kind outside the lists', async () => {
    const { db, repos, bench } = await commentWorld();
    const { comment } = await repos.elementComments.upsertOpen(bench);
    const where = sql`where id = ${comment.id}`;
    for (const change of [sql`kind = 'shout'`, sql`status = 'gone'`, sql`element_kind = 'zone'`]) {
      await expect(
        db.execute(sql`update element_comments set ${change} ${where}`),
      ).rejects.toThrow();
    }
  });
});
