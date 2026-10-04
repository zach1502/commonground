import { FakeClock } from '@parkshape/core';

import type { SubmitResult } from '../design-repository.js';
import type { CreateDraftResult, CreateVersionResult } from '../guarded-writes.js';
import type { CreateProjectResult, NewProject } from '../project-repository.js';
import type { Design, JsonObject, Project, RepositoryDeps, User } from '../records.js';
import type { Repositories } from '../repositories.js';

export type RepositoriesFactory = (deps: RepositoryDeps) => Promise<Repositories>;

export const CONTRACT_START = new Date('2026-09-01T12:00:00.000Z');
export const MINUTE_MS = 60_000;
const ID_DIGITS = 4;

export interface ContractWorld {
  readonly repos: Repositories;
  readonly clock: FakeClock;
}

/** Fresh repositories with a fake clock and sequential ids. */
export async function makeWorld(factory: RepositoriesFactory): Promise<ContractWorld> {
  const clock = new FakeClock(CONTRACT_START);
  let next = 0;
  const newId = (): string => {
    next += 1;
    return `id-${String(next).padStart(ID_DIGITS, '0')}`;
  };
  return { repos: await factory({ clock, newId }), clock };
}

export function seedUser(repos: Repositories, id = 'user-a'): Promise<User> {
  return repos.users.upsert({ id, role: 'resident', displayName: `Person ${id}` });
}

/** The staff member who creates the seeded projects. */
export const PROJECT_AUTHOR = 'staff-a';

export function seedStaff(repos: Repositories, id = PROJECT_AUTHOR): Promise<User> {
  return repos.users.upsert({ id, role: 'staff', displayName: `Staff ${id}` });
}

/** The project a create made, or a thrown error naming what the repository returned instead. */
export function createdProject(result: CreateProjectResult): Project {
  if (result.kind !== 'created') {
    throw new Error(`create returned ${result.kind} in a contract fixture`);
  }
  return result.project;
}

/** A new project input with this name by this staff author, as the wizard sends it. */
export function newProject(name: string, authorId = PROJECT_AUTHOR): NewProject {
  return {
    name,
    authorId,
    parameters: { budget: 100 },
    parcel: { id: 'parcel-1' },
    heightmapRef: 'terrain/jrp.bin',
  };
}

export async function seedProject(
  repos: Repositories,
  name = 'Jonathan Rogers Park',
): Promise<Project> {
  await seedStaff(repos);
  return createdProject(await repos.projects.create(newProject(name)));
}

/** The document every seeded draft holds, and so the one a submit in a fixture has measured. */
export const SEED_DOCUMENT: JsonObject = { version: 1, items: [] };

export async function seedDraft(repos: Repositories, projectId: string, authorId: string) {
  return repos.designs.create({
    projectId,
    authorId,
    title: 'Shady corner',
    blurb: 'More trees by the lane.',
    document: SEED_DOCUMENT,
    forkedFrom: null,
  });
}

// Far above any count a contract test reaches, for tests about something other than the cap.
const NO_CAP = Number.MAX_SAFE_INTEGER;

/** Submit input for tests that are not about the live cap, measured on the seeded document. */
export function uncapped(metrics: JsonObject, measured: JsonObject = SEED_DOCUMENT) {
  return { metrics, document: measured, liveCap: NO_CAP };
}

/** The submitted design, or a thrown error naming what the repository returned instead. */
export function submittedDesign(result: SubmitResult): Design {
  if (result.kind !== 'submitted') {
    throw new Error(`submit returned ${result.kind} in a contract fixture`);
  }
  return result.design;
}

/** The new draft of a version or a createDraft, or a thrown error naming what came back instead. */
export function createdVersion(result: CreateVersionResult | CreateDraftResult): Design {
  if (result.kind !== 'created') {
    throw new Error(`the write returned ${result.kind} in a contract fixture`);
  }
  return result.design;
}
