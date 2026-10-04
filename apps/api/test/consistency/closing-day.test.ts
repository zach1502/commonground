import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GARDEN, createDraft, createProject } from '../fixtures.js';
import { errorKind } from '../harness.js';

import { startRaceWorld, version, vote, type RaceWorld } from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

const DAY_MS = 86_400_000;
const PARK_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' });

async function gardenDraft(cookie: string, projectId: string) {
  const draft = await createDraft(world.h, cookie, projectId);
  const body = { title: 'Garden corner', blurb: 'Beds by the lane.', document: GARDEN };
  await world.h.call('PUT', `/designs/${draft.id}`, { cookie, body });
  return draft;
}

/** An open project whose last day is today on the park's clock, with one live design. */
async function projectClosingToday() {
  const closesAt = PARK_DAY.format(world.h.clock.now());
  const project = await createProject(world.h, world.staff, { closesAt });
  const draft = await gardenDraft(world.bob, project.id);
  const submit = await world.h.call('POST', `/designs/${draft.id}/submit`, {
    cookie: world.bob,
  });
  expect(submit.status).toBe(200);
  return { project, liveId: draft.id };
}

/** The closing day ends while the request is between its phase check and its write. */
const dayEnds = () => {
  world.h.clock.advance(DAY_MS);
  return Promise.resolve();
};

describe('a closing day that passes between the phase check and the write', () => {
  it('refuses the vote with 409 phaseClosed', async () => {
    const { project, liveId } = await projectClosingToday();
    world.windows.before('votes', 'upsertVote', dayEnds);
    const response = await vote(world, world.molly, liveId, 1);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    expect(await world.h.deps.repos.votes.listByProject(project.id)).toEqual([]);
  });

  it('refuses the submit with 409 phaseClosed', async () => {
    const { project } = await projectClosingToday();
    const draft = await gardenDraft(world.molly, project.id);
    world.windows.before('designs', 'submit', dayEnds);
    const response = await world.h.call('POST', `/designs/${draft.id}/submit`, {
      cookie: world.molly,
    });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    expect((await world.h.deps.repos.designs.findById(draft.id))?.status).toBe('draft');
  });

  it('refuses a new version with 409 phaseClosed', async () => {
    const { liveId } = await projectClosingToday();
    world.windows.before('designs', 'createVersion', dayEnds);
    const response = await version(world, world.bob, liveId);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    expect((await world.h.deps.repos.designs.findById(liveId))?.status).toBe('submitted');
  });
});
