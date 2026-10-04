import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  projectWithLiveDesign,
  setVote,
  startRaceWorld,
  vote,
  withdraw,
  type RaceWorld,
} from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

const PARALLEL_CHANGES = 6;

async function onlyVote(projectId: string, designId: string) {
  const votes = await world.h.deps.repos.votes.listByProject(projectId);
  const design = await world.h.deps.repos.designs.findById(designId);
  return { votes, counts: { up: design?.up, down: design?.down } };
}

describe('one person changing a vote in parallel', () => {
  it('keeps one row and counters that match it when two first votes race', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    const responses = await Promise.all([
      vote(world, world.molly, live.id, 1),
      vote(world, world.molly, live.id, -1),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes).toHaveLength(1);
    const value = votes[0]?.value;
    expect(counts).toEqual({ up: value === 1 ? 1 : 0, down: value === -1 ? 1 : 0 });
  });

  it('keeps one row and exact counters when many changes of one vote race', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    const responses = await Promise.all(
      Array.from({ length: PARALLEL_CHANGES }, (_, index) =>
        vote(world, world.molly, live.id, index % 2 === 0 ? -1 : 1),
      ),
    );
    expect(responses.filter((response) => response.status !== 200)).toEqual([]);
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes).toHaveLength(1);
    const value = votes[0]?.value;
    expect(counts).toEqual({ up: value === 1 ? 1 : 0, down: value === -1 ? 1 : 0 });
  });

  it('lets the change that writes last win when another lands in its window', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    world.windows.before('votes', 'upsertVote', async () => {
      expect((await vote(world, world.molly, live.id, -1)).status).toBe(200);
    });
    const response = await vote(world, world.molly, live.id, 1);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ outcome: 'updated', design: { up: 1, down: 0 } });
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes.map((row) => row.value)).toEqual([1]);
    expect(counts).toEqual({ up: 1, down: 0 });
  });
});

describe('one person withdrawing a vote while changing it', () => {
  it('creates a fresh vote when a withdraw lands in the window of a change', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    world.windows.before('votes', 'upsertVote', async () => {
      expect((await withdraw(world, world.molly, live.id)).status).toBe(200);
    });
    const response = await setVote(world, world.molly, live.id, { value: -1 });
    expect(response.body).toMatchObject({ outcome: 'created', design: { up: 0, down: 1 } });
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes.map((row) => row.value)).toEqual([-1]);
    expect(counts).toEqual({ up: 0, down: 1 });
  });

  it('removes the changed vote when a change lands in the window of a withdraw', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    world.windows.before('votes', 'withdrawVote', async () => {
      const changed = await setVote(world, world.molly, live.id, { value: -1 });
      expect(changed.body).toMatchObject({ design: { up: 0, down: 1 } });
    });
    const response = await withdraw(world, world.molly, live.id);
    expect(response.body).toMatchObject({ outcome: 'withdrawn', design: { up: 0, down: 0 } });
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes).toEqual([]);
    expect(counts).toEqual({ up: 0, down: 0 });
  });
});

describe('one person editing reasons while changing a vote', () => {
  it('moves no counter when a reasons-only change lands in the window of another', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await setVote(world, world.molly, live.id, { value: 1 })).status).toBe(200);
    world.windows.before('votes', 'upsertVote', async () => {
      const first = await setVote(world, world.molly, live.id, { value: 1, reasons: ['trees'] });
      expect(first.body).toMatchObject({ outcome: 'updated', design: { up: 1, down: 0 } });
    });
    const response = await setVote(world, world.molly, live.id, { value: 1, reasons: ['water'] });
    expect(response.body).toMatchObject({ outcome: 'updated', design: { up: 1, down: 0 } });
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes.map((row) => row.reasons)).toEqual([['water']]);
    expect(counts).toEqual({ up: 1, down: 0 });
  });

  it('keeps counters that match the stored vote when changes, reason edits and withdraws race', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    const steps = [
      () => withdraw(world, world.molly, live.id),
      () => setVote(world, world.molly, live.id, { value: 1, reasons: ['play'] }),
      () => setVote(world, world.molly, live.id, { value: -1 }),
      () => withdraw(world, world.molly, live.id),
      () => setVote(world, world.molly, live.id, { value: -1, reasons: ['too-paved'] }),
      () => setVote(world, world.molly, live.id, { value: 1 }),
    ];
    const responses = await Promise.all(steps.map((step) => step()));
    expect(responses.filter((response) => response.status !== 200)).toEqual([]);
    const { votes, counts } = await onlyVote(project.id, live.id);
    expect(votes.length).toBeLessThanOrEqual(1);
    const value = votes[0]?.value;
    expect(counts).toEqual({ up: value === 1 ? 1 : 0, down: value === -1 ? 1 : 0 });
  });
});
