import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GARDEN, createDraft, createProject } from '../fixtures.js';
import { errorKind } from '../harness.js';

import {
  closeProject,
  projectWithLiveDesign,
  startRaceWorld,
  vote,
  type RaceWorld,
} from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

async function savedGardenDraft(projectId: string) {
  const draft = await createDraft(world.h, world.bob, projectId);
  const body = { title: 'Garden corner', blurb: 'Beds by the lane.', document: GARDEN };
  await world.h.call('PUT', `/designs/${draft.id}`, { cookie: world.bob, body });
  return draft;
}

describe('a close that lands between the phase guard and the write', () => {
  it('refuses the submit with 409 phaseClosed and leaves the draft a draft', async () => {
    const project = await createProject(world.h, world.staff);
    const draft = await savedGardenDraft(project.id);
    world.windows.before('designs', 'submit', async () => {
      expect((await closeProject(world, project.id)).status).toBe(200);
    });
    const response = await world.h.call('POST', `/designs/${draft.id}/submit`, {
      cookie: world.bob,
    });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    const stored = await world.h.deps.repos.designs.findById(draft.id);
    expect(stored).toMatchObject({ status: 'draft', metrics: null, submittedAt: null });
  });

  it('refuses the vote with 409 phaseClosed and moves no counter', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    world.windows.before('votes', 'upsertVote', async () => {
      expect((await closeProject(world, project.id)).status).toBe(200);
    });
    const response = await vote(world, world.molly, live.id, 1);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    expect(await world.h.deps.repos.votes.listByProject(project.id)).toEqual([]);
    const stored = await world.h.deps.repos.designs.findById(live.id);
    expect(stored).toMatchObject({ up: 0, down: 0 });
  });

  it('refuses a change of an earlier vote once the project has closed', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    expect((await vote(world, world.molly, live.id, 1)).status).toBe(200);
    world.windows.before('votes', 'upsertVote', async () => {
      expect((await closeProject(world, project.id)).status).toBe(200);
    });
    const response = await vote(world, world.molly, live.id, -1);
    expect(response.status).toBe(409);
    const votes = await world.h.deps.repos.votes.listByProject(project.id);
    expect(votes.map((row) => row.value)).toEqual([1]);
    expect(await world.h.deps.repos.designs.findById(live.id)).toMatchObject({ up: 1, down: 0 });
  });
});

describe('two status changes that read the same project', () => {
  it('lets one close through and answers the other with 409', async () => {
    const project = await createProject(world.h, world.staff);
    let competing: number | undefined;
    world.windows.after('projects', 'findById', async () => {
      competing = (await closeProject(world, project.id)).status;
    });
    const response = await closeProject(world, project.id);
    expect(competing).toBe(200);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
  });

  it('reopens with a new closing day in one write, so a failed reopen changes nothing', async () => {
    const project = await createProject(world.h, world.staff, { closesAt: '2026-10-31' });
    expect((await closeProject(world, project.id)).status).toBe(200);
    world.windows.after('projects', 'findById', async () => {
      const body = { status: 'open', closesAt: '2026-11-30' };
      const reopen = { cookie: world.staff, body };
      expect((await world.h.call('PATCH', `/projects/${project.id}/status`, reopen)).status).toBe(
        200,
      );
    });
    const body = { status: 'open', closesAt: '2026-11-30' };
    const late = { cookie: world.staff, body };
    const response = await world.h.call('PATCH', `/projects/${project.id}/status`, late);
    expect(response.status).toBe(409);
    const stored = await world.h.deps.repos.projects.findById(project.id);
    expect(stored).toMatchObject({ status: 'open', closesAt: '2026-11-30' });
  });
});
