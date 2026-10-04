import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorKind } from '../harness.js';

import {
  allDesigns,
  closeProject,
  projectWithLiveDesign,
  startRaceWorld,
  version,
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

/** A live design with one up vote and one down vote, so a test can see the counts hold. */
async function votedLiveDesign() {
  const { project, live } = await projectWithLiveDesign(world);
  await vote(world, world.molly, live.id, 1);
  await vote(world, world.kevin, live.id, -1);
  return { project, live };
}

async function votesOn(projectId: string, designId: string) {
  const votes = await world.h.deps.repos.votes.listByProject(projectId);
  return votes.filter((row) => row.designId === designId).map((row) => row.userId);
}

describe('versionDesign with a competing write in its window', () => {
  it('answers 409 and creates nothing when another version supersedes the design first', async () => {
    const { project, live } = await votedLiveDesign();
    let competing: number | undefined;
    world.windows.before('designs', 'createVersion', async () => {
      competing = (await version(world, world.bob, live.id)).status;
    });
    const response = await version(world, world.bob, live.id);
    expect(competing).toBe(201);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
    const designs = await allDesigns(world, project.id);
    expect(designs.filter((design) => design.versionOf === live.id)).toHaveLength(1);
    const source = designs.find((design) => design.id === live.id);
    expect(source).toMatchObject({ status: 'superseded', up: 1, down: 1 });
    expect(await votesOn(project.id, live.id)).toHaveLength(2);
  });

  it('answers 409 phaseClosed and leaves the design live when the project closes first', async () => {
    const { project, live } = await votedLiveDesign();
    world.windows.before('designs', 'createVersion', async () => {
      expect((await closeProject(world, project.id)).status).toBe(200);
    });
    const response = await version(world, world.bob, live.id);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('phase-closed');
    const designs = await allDesigns(world, project.id);
    expect(designs.filter((design) => design.versionOf === live.id)).toEqual([]);
    const source = designs.find((design) => design.id === live.id);
    expect(source).toMatchObject({ status: 'submitted', up: 1, down: 1 });
    expect(await votesOn(project.id, live.id)).toHaveLength(2);
  });

  it('keeps the votes on the old design when a version goes through', async () => {
    const { project, live } = await votedLiveDesign();
    const response = await version(world, world.bob, live.id);
    expect(response.status).toBe(201);
    const designs = await allDesigns(world, project.id);
    const successor = designs.find((design) => design.versionOf === live.id);
    expect(successor).toMatchObject({ status: 'draft', up: 0, down: 0 });
    expect(designs.find((design) => design.id === live.id)).toMatchObject({ up: 1, down: 1 });
    expect(await votesOn(project.id, live.id)).toHaveLength(2);
    expect(await votesOn(project.id, successor?.id ?? '')).toEqual([]);
  });
});
