import { createProject, submitGarden } from '../fixtures.js';
import {
  KEVIN,
  BOB,
  MOLLY,
  SALLY,
  STAFF,
  startHarness,
  type CallResult,
  type Harness,
} from '../harness.js';

import { RaceWindows, WindowedBlobStore } from './windows.js';

const GENEROUS = '1000';

/** One API with race windows over its repositories and blob store, and a signed-in cast. */
export interface RaceWorld {
  readonly h: Harness;
  readonly windows: RaceWindows;
  readonly blobs: WindowedBlobStore;
  readonly staff: string;
  readonly bob: string;
  readonly molly: string;
  readonly kevin: string;
  readonly sally: string;
}

export async function startRaceWorld(): Promise<RaceWorld> {
  const windows = new RaceWindows();
  const blobs = new WindowedBlobStore();
  const h = await startHarness(
    {
      RATE_LIMIT_SUBMISSIONS_PER_HOUR: GENEROUS,
      RATE_LIMIT_VOTES_PER_MINUTE: GENEROUS,
      RATE_LIMIT_LOGINS_PER_MINUTE: GENEROUS,
      RATE_LIMIT_THUMBNAILS_PER_HOUR: GENEROUS,
      RATE_LIMIT_DRAFT_SAVES_PER_MINUTE: GENEROUS,
    },
    { blobStore: blobs, repos: (inner) => windows.wrap(inner) },
  );
  return {
    h,
    windows,
    blobs,
    staff: await h.login(STAFF),
    bob: await h.login(BOB),
    molly: await h.login(MOLLY),
    kevin: await h.login(KEVIN),
    sally: await h.login(SALLY),
  };
}

/** Staff close the project and the close commits before this returns. */
export async function closeProject(world: RaceWorld, projectId: string): Promise<CallResult> {
  return world.h.call('PATCH', `/projects/${projectId}/status`, {
    cookie: world.staff,
    body: { status: 'closed' },
  });
}

export function vote(world: RaceWorld, cookie: string, designId: string, value: 1 | -1) {
  return world.h.call('POST', '/votes', { cookie, body: { designId, value, reasons: [] } });
}

/** The PUT on the vote resource: the vote's value, reasons and comment set together. */
export function setVote(
  world: RaceWorld,
  cookie: string,
  designId: string,
  change: { readonly value: 1 | -1; readonly reasons?: readonly string[] },
) {
  const body = { reasons: [], ...change };
  return world.h.call('PUT', `/designs/${designId}/my-vote`, { cookie, body });
}

export function withdraw(world: RaceWorld, cookie: string, designId: string) {
  return world.h.call('DELETE', `/designs/${designId}/my-vote`, { cookie });
}

export function version(world: RaceWorld, cookie: string, designId: string) {
  return world.h.call('POST', `/designs/${designId}/version`, { cookie });
}

/** A new open project with one live design by Bob. */
export async function projectWithLiveDesign(world: RaceWorld, extra = {}) {
  const project = await createProject(world.h, world.staff, extra);
  const live = await submitGarden(world.h, world.bob, project.id);
  return { project, live };
}

/** Every design in the project, drafts included, read straight from the repositories. */
export async function allDesigns(world: RaceWorld, projectId: string) {
  const { designs } = world.h.deps.repos;
  const statuses = ['draft', 'submitted', 'superseded'] as const;
  const lists = await Promise.all(
    statuses.map((status) => designs.listByProject(projectId, status)),
  );
  return lists.flat();
}
