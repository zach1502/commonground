import { describe, expect, it } from 'vitest';

import {
  CONTRACT_START,
  MINUTE_MS,
  PROJECT_AUTHOR,
  createdProject,
  makeWorld,
  newProject,
  seedProject,
  seedStaff,
} from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';

/** Behaviour every ProjectRepository adapter must have. */
export function projectRepositoryContract(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the ProjectRepository contract`, () => {
    projectRecordContract(factory);
    projectNameContract(factory);
  });
}

/** Creates, reads and changes of one project. */
function projectRecordContract(factory: RepositoriesFactory): void {
  it('creates an open project with no baseline', async () => {
    const { repos } = await makeWorld(factory);
    const project = await seedProject(repos);
    expect(project).toMatchObject({
      name: 'Jonathan Rogers Park',
      authorId: PROJECT_AUTHOR,
      status: 'open',
      baselineDesignId: null,
      parameters: { budget: 100 },
      parcel: { id: 'parcel-1' },
      heightmapRef: 'terrain/jrp.bin',
      closesAt: null,
      createdAt: CONTRACT_START,
    });
    expect(await repos.projects.findById(project.id)).toEqual(project);
  });

  it('keeps the closing date given at create and changes it later', async () => {
    const { repos } = await makeWorld(factory);
    await seedStaff(repos);
    const project = createdProject(
      await repos.projects.create({
        ...newProject('Jonathan Rogers Park'),
        closesAt: '2026-10-31',
      }),
    );
    expect(project.closesAt).toBe('2026-10-31');
    expect((await repos.projects.findById(project.id))?.closesAt).toBe('2026-10-31');
    expect((await repos.projects.setClosesAt(project.id, '2026-11-15'))?.closesAt).toBe(
      '2026-11-15',
    );
    expect((await repos.projects.setClosesAt(project.id, null))?.closesAt).toBeNull();
    expect(await repos.projects.setClosesAt('missing', '2026-11-15')).toBeUndefined();
  });

  it('lists projects oldest first', async () => {
    const { repos, clock } = await makeWorld(factory);
    const first = await seedProject(repos, 'First');
    clock.advance(MINUTE_MS);
    const second = await seedProject(repos, 'Second');
    expect((await repos.projects.list()).map((project) => project.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('changes status and baseline, and returns undefined for unknown ids', async () => {
    const { repos } = await makeWorld(factory);
    const project = await seedProject(repos);
    expect((await repos.projects.setStatus(project.id, 'closed'))?.status).toBe('closed');
    const withBaseline = await repos.projects.setBaselineDesign(project.id, 'design-x');
    expect(withBaseline?.baselineDesignId).toBe('design-x');
    expect(await repos.projects.setStatus('missing', 'open')).toBeUndefined();
    expect(await repos.projects.setBaselineDesign('missing', 'x')).toBeUndefined();
    expect(await repos.projects.findById('missing')).toBeUndefined();
  });
}

/** One staff author cannot hold two projects with one name, however the creates interleave. */
function projectNameContract(factory: RepositoriesFactory): void {
  it('refuses a second project with one name by one author, whatever the case', async () => {
    const { repos } = await makeWorld(factory);
    const first = await seedProject(repos, 'Jonathan Rogers Park');
    const again = await repos.projects.create(newProject('JONATHAN rogers park'));
    expect(again).toEqual({ kind: 'name-taken', existingId: first.id });
    expect(await repos.projects.list()).toEqual([first]);
  });

  it('allows one name for two authors, and two names for one author', async () => {
    const { repos } = await makeWorld(factory);
    await seedProject(repos, 'Jonathan Rogers Park');
    await seedStaff(repos, 'staff-b');
    const other = await repos.projects.create(newProject('Jonathan Rogers Park', 'staff-b'));
    const renamed = await repos.projects.create(newProject('Jonathan Rogers Park, east'));
    expect([other.kind, renamed.kind]).toEqual(['created', 'created']);
    expect(await repos.projects.list()).toHaveLength(3);
  });

  it('creates one project when two creates with one name by one author run at once', async () => {
    const { repos } = await makeWorld(factory);
    await seedStaff(repos);
    const both = await Promise.all([
      repos.projects.create(newProject('Jonathan Rogers Park')),
      repos.projects.create(newProject('Jonathan Rogers Park')),
    ]);
    expect(both.map((result) => result.kind).sort()).toEqual(['created', 'name-taken']);
    expect(await repos.projects.list()).toHaveLength(1);
  });
}
