import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MOLLY, SALLY } from '../harness.js';

import { startRaceWorld, type RaceWorld } from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

const PARALLEL_LOGINS = 8;
const FIRST = { fsa: 'V5T', ageBand: '30-44' };
const SECOND = { fsa: 'V6A', ageBand: '45-64' };

function patch(cookie: string, body: unknown) {
  return world.h.call('PATCH', '/me/self-report', { cookie, body });
}

function login(persona: string) {
  return world.h.call('POST', '/auth/login', { body: { persona } });
}

describe('sign-in and self report under parallel duplicates', () => {
  it('makes one user when the same persona signs in many times at once', async () => {
    const responses = await Promise.all(
      Array.from({ length: PARALLEL_LOGINS }, () => login(SALLY)),
    );
    expect(responses.filter((response) => response.status !== 200)).toEqual([]);
    const user = await world.h.deps.repos.users.findById(SALLY);
    expect(user).toMatchObject({ id: SALLY, role: 'resident' });
  });

  it('stores the same report once when two identical saves race', async () => {
    const responses = await Promise.all([patch(world.molly, FIRST), patch(world.molly, FIRST)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await world.h.deps.repos.users.findById(MOLLY))?.selfReport).toEqual(FIRST);
  });

  it('keeps the save that writes last when another lands in its window', async () => {
    world.windows.before('users', 'setSelfReport', async () => {
      expect((await patch(world.molly, SECOND)).status).toBe(200);
    });
    expect((await patch(world.molly, FIRST)).status).toBe(200);
    expect((await world.h.deps.repos.users.findById(MOLLY))?.selfReport).toEqual(FIRST);
  });

  it('keeps the self report when a sign-in lands in the save window', async () => {
    world.windows.before('users', 'setSelfReport', async () => {
      expect((await login(MOLLY)).status).toBe(200);
    });
    expect((await patch(world.molly, SECOND)).status).toBe(200);
    const user = await world.h.deps.repos.users.findById(MOLLY);
    expect(user?.selfReport).toEqual(SECOND);
    world.windows.before('users', 'upsert', async () => {
      expect((await patch(world.molly, FIRST)).status).toBe(200);
    });
    expect((await login(MOLLY)).status).toBe(200);
    const after = await world.h.deps.repos.users.findById(MOLLY);
    expect(after).toMatchObject({ selfReport: FIRST, createdAt: user?.createdAt });
  });
});
