import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { designSchema } from '../../src/contracts/projects-designs.js';
import { BLANK, GARDEN, createProject } from '../fixtures.js';
import { errorKind } from '../harness.js';

import {
  allDesigns,
  closeProject,
  projectWithLiveDesign,
  startRaceWorld,
  version,
  type RaceWorld,
} from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

function newDraft(cookie: string, projectId: string, body: Record<string, unknown>) {
  return world.h.call('POST', `/projects/${projectId}/designs`, { cookie, body });
}

describe('createDraft with a competing write between the source read and the insert', () => {
  it('refuses a fork whose source was superseded after it was read', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    world.windows.after('designs', 'findById', async () => {
      expect((await version(world, world.bob, live.id)).status).toBe(201);
    });
    const response = await newDraft(world.molly, project.id, {
      from: 'fork',
      sourceDesignId: live.id,
    });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
    const forks = (await allDesigns(world, project.id)).filter((d) => d.forkedFrom === live.id);
    expect(forks).toEqual([]);
  });

  it('copies the baseline as it stands when the copy is written', async () => {
    const project = await createProject(world.h, world.staff, { baselineDocument: BLANK });
    const baselineId = project.baselineDesignId ?? '';
    const saved = { title: 'Current park', blurb: 'Surveyed again.', document: GARDEN };
    world.windows.after('designs', 'findById', async () => {
      const put = { cookie: world.staff, body: saved };
      expect((await world.h.call('PUT', `/designs/${baselineId}`, put)).status).toBe(200);
    });
    const response = await newDraft(world.molly, project.id, { from: 'baseline' });
    expect(response.status).toBe(201);
    const draft = designSchema.parse(response.body);
    const baseline = await world.h.deps.repos.designs.findById(baselineId);
    const copy = await world.h.deps.repos.designs.findById(draft.id);
    expect(copy?.document).toEqual(baseline?.document);
    expect(copy?.forkedFrom).toBeNull();
  });

  it('refuses a blank draft when the project closes after the phase check', async () => {
    const project = await createProject(world.h, world.staff);
    world.windows.after('projects', 'findById', async () => {
      expect((await closeProject(world, project.id)).status).toBe(200);
    });
    const response = await newDraft(world.molly, project.id, { from: 'blank' });
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    expect(await allDesigns(world, project.id)).toEqual([]);
  });

  it('points forkedFrom at the design whose document it copied', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    const response = await newDraft(world.molly, project.id, {
      from: 'fork',
      sourceDesignId: live.id,
    });
    const fork = designSchema.parse(response.body);
    const stored = await world.h.deps.repos.designs.findById(fork.id);
    const source = await world.h.deps.repos.designs.findById(live.id);
    expect(stored).toMatchObject({ forkedFrom: live.id, document: source?.document });
  });
});
