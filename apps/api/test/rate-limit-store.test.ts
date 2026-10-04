import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { InMemoryRateLimitStore, PostgresRateLimitStore } from '@parkshape/db';

import { createInMemoryDeps } from '../src/container.js';
import { createLimits } from '../src/limits.js';

import { createProject, submitGarden } from './fixtures.js';
import { BOB, MOLLY, STAFF, startHarness, type Harness } from './harness.js';

const VOTES_PER_MINUTE = 2;
const LIMITED = 429;

let h: Harness;
let memory: Harness;

// Both harnesses start in the hook: starting pglite under a full parallel run takes longer
// than the 5 s test timeout, and the hooks get the pglite budget from vitest.config.ts.
beforeAll(async () => {
  h = await startHarness({
    RATE_LIMIT_STORE: 'postgres',
    RATE_LIMIT_VOTES_PER_MINUTE: String(VOTES_PER_MINUTE),
  });
  memory = await startHarness();
});

afterAll(async () => {
  await Promise.all([h.close(), memory.close()]);
});

describe('RATE_LIMIT_STORE', () => {
  it('keeps the buckets in the database when set to postgres', () => {
    expect(h.deps.rateLimitStore).toBeInstanceOf(PostgresRateLimitStore);
  });

  it('keeps the buckets in memory by default', () => {
    expect(memory.deps.rateLimitStore).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it('cannot be postgres without a database', () => {
    expect(() => createInMemoryDeps(loadConfig({ RATE_LIMIT_STORE: 'postgres' }))).toThrow(
      /RATE_LIMIT_STORE/,
    );
  });

  it('shares vote counts between two function instances over one database', async () => {
    const staff = await h.login(STAFF);
    const bob = await h.login(BOB);
    const molly = await h.login(MOLLY);
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    const vote = { cookie: molly, body: { designId: design.id, value: 1, reasons: [] } };
    // A second instance: its own limiters, the same database-backed store.
    const other = createLimits(
      loadConfig({ RATE_LIMIT_VOTES_PER_MINUTE: String(VOTES_PER_MINUTE) }),
      { clock: h.clock, store: h.deps.rateLimitStore },
    );
    const session = await h.deps.auth.readSession(molly);
    expect((await h.call('POST', '/votes', vote)).status).toBe(200);
    expect((await other.votes.take(session?.userId ?? '')).kind).toBe('allowed');
    expect((await h.call('POST', '/votes', vote)).status).toBe(LIMITED);
  });
});
