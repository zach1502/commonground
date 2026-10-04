import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfigFromProcess } from '@parkshape/config';

import {
  makeWorld,
  seedDraft,
  seedProject,
  seedUser,
  submittedDesign,
  uncapped,
} from '../../ports/__contracts__/fixtures.js';
import { openTestDatabase } from '../../testing/test-database.js';

import { createDrizzleRepositories } from './connect.js';
import { resultRows } from './migrations.js';
import type { OpenDatabase } from './pglite.js';
import { projects } from './schema/index.js';

// pglite runs one transaction at a time, so a write started while a close is open simply waits
// its turn. A real server runs both, so the test waits until the write is blocked on the lock.
const ON_SERVER = loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL !== '';
const PGLITE_START_TIMEOUT_MS = 60_000;
const MAX_LOCK_POLLS = 5000;

let connection: OpenDatabase | undefined;

beforeAll(async () => {
  connection = await openTestDatabase();
}, PGLITE_START_TIMEOUT_MS);

afterAll(async () => {
  await connection?.close();
});

function database() {
  if (connection === undefined) throw new Error('the test database did not start');
  return connection.db;
}

async function world() {
  const db = database();
  await db.execute(sql`truncate element_comments, votes, designs, projects, users`);
  const made = await makeWorld((deps) => Promise.resolve(createDrizzleRepositories(db, deps)));
  const author = await seedUser(made.repos, 'author');
  const voter = await seedUser(made.repos, 'voter');
  const project = await seedProject(made.repos);
  const draft = await seedDraft(made.repos, project.id, author.id);
  const live = submittedDesign(await made.repos.designs.submit(draft.id, uncapped({})));
  return { ...made, author, voter, project, live };
}

type Tx = Parameters<Parameters<ReturnType<typeof database>['transaction']>[0]>[0];

/**
 * Polls, one query per turn, until another backend waits on a lock; no timers are involved.
 * pg_locks is read live, while pg_stat_activity is a snapshot fixed for the whole transaction.
 */
async function someoneWaitsOnALock(tx: Tx): Promise<boolean> {
  for (let poll = 0; poll < MAX_LOCK_POLLS; poll += 1) {
    const waiting = resultRows(await tx.execute(sql`select 1 from pg_locks where not granted`));
    if (waiting.length > 0) return true;
  }
  return false;
}

// Set by each write below: whether the write was seen waiting on the uncommitted close.
let waited = false;

/** Holds an uncommitted close while `write` starts, then commits it; returns what the write did. */
async function writeDuringClose<T>(projectId: string, write: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  waited = !ON_SERVER;
  await database().transaction(async (tx) => {
    await tx.update(projects).set({ status: 'closed' }).where(eq(projects.id, projectId));
    pending = write();
    // The write settles only after this commit, so a rejection is caught below, not here.
    pending.catch(() => undefined);
    if (ON_SERVER) waited = await someoneWaitsOnALock(tx);
  });
  if (pending === undefined) throw new Error('the write never started');
  return pending;
}

describe('a guarded write that meets an uncommitted close', () => {
  it('waits for the close to commit and then refuses the vote', async () => {
    const { repos, voter, live, project } = await world();
    const cast = { userId: voter.id, designId: live.id, value: 1, reasons: [] } as const;
    await expect(
      writeDuringClose(project.id, () => repos.votes.upsertVote(cast)),
    ).rejects.toMatchObject({ kind: 'phase-closed' });
    expect(await repos.designs.findById(live.id)).toMatchObject({ up: 0, down: 0 });
    expect(waited).toBe(true);
  });

  it('waits for the close to commit and then refuses the element comment', async () => {
    const { repos, voter, live, project } = await world();
    const comment = {
      designId: live.id,
      authorId: voter.id,
      elementId: 'bench-1',
      elementKind: 'item',
      category: 'seating',
      kind: 'move',
      text: 'Face the playground',
    } as const;
    await expect(
      writeDuringClose(project.id, () => repos.elementComments.upsertOpen(comment)),
    ).rejects.toMatchObject({ kind: 'phase-closed' });
    expect(await repos.elementComments.listByDesign(live.id, { hidden: 'include' })).toEqual([]);
    expect(waited).toBe(true);
  });

  it('waits for the close to commit and then refuses the submit', async () => {
    const { repos, author, project } = await world();
    const draft = await seedDraft(repos, project.id, author.id);
    const result = await writeDuringClose(project.id, () =>
      repos.designs.submit(draft.id, uncapped({})),
    );
    expect(result).toEqual({ kind: 'phase-closed' });
    expect(waited).toBe(true);
  });

  it('waits for the close to commit and then refuses the version', async () => {
    const { repos, live, project } = await world();
    const result = await writeDuringClose(project.id, () => repos.designs.createVersion(live.id));
    expect(result).toEqual({ kind: 'phase-closed' });
    expect((await repos.designs.findById(live.id))?.status).toBe('submitted');
    expect(waited).toBe(true);
  });
});
