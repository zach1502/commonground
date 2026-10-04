import {
  catalogIndex,
  FakeClock,
  MAX_LIVE_SUBMISSIONS,
  rankDesigns,
  resolveAnchor,
  type DesignDocument,
} from '@parkshape/core';

import { createInMemoryRepositories } from '../adapters/memory/index.js';
import type { Repositories } from '../ports/repositories.js';

import type { SeedPlan } from './plan.js';
import {
  runSeed,
  type SeedGateway,
  type SeedOptions,
  type SeedSummary,
  type ThumbnailJob,
  type ThumbnailStep,
} from './seed.js';

const PRIOR = { up: 2, down: 2 };
const START = new Date('2026-09-01T00:00:00Z');

type Submission = Parameters<SeedGateway['submitDesign']>[0];

async function submitDirect(repos: Repositories, submission: Submission) {
  const { projectId, author, title, blurb, document, draftId } = submission;
  const draft =
    draftId === undefined
      ? await repos.designs.create({
          projectId,
          authorId: author.id,
          title,
          blurb,
          document,
          forkedFrom: null,
        })
      : { id: draftId };
  const stored = await repos.designs.findById(draft.id);
  if (stored === undefined) throw new Error(`draft ${draft.id} is missing`);
  const submitted = await repos.designs.submit(draft.id, {
    metrics: {},
    document: stored.document,
    liveCap: MAX_LIVE_SUBMISSIONS,
  });
  if (submitted.kind !== 'submitted') throw new Error(`submit failed: ${submitted.kind}`);
  return { ...submitted.design, document };
}

async function countDirect(repos: Repositories, projectId: string, ids: readonly string[]) {
  const totals = await repos.votes.totalsForProject(projectId);
  const users = await Promise.all(ids.map((id) => repos.users.findById(id)));
  return {
    designs: (await repos.designs.listByProject(projectId, 'submitted')).length,
    votes: totals.votes,
    voters: totals.uniqueVoters,
    selfReports: users.filter((user) => user?.selfReport != null).length,
  };
}

async function listDirect(repos: Repositories, projectId: string) {
  const stored = [
    ...(await repos.designs.listByProject(projectId, 'submitted')),
    ...(await repos.designs.listByProject(projectId, 'draft')),
  ];
  return stored.map((design) => ({ ...design, document: design.document as never }));
}

/** The keys a test's blob store holds, and every key the seed wrote in order. */
export interface SeedBlobLedger {
  readonly keys: Set<string>;
  readonly writes: string[];
}

/** Creates the project with its baseline, a staff-owned draft, as the API does. */
async function createDirect(
  repos: Repositories,
  blobs: SeedBlobLedger,
  site: Parameters<SeedGateway['createProject']>[0],
  staff: Parameters<SeedGateway['createProject']>[1],
) {
  for (const blob of site.blobs) blobs.keys.add(blob.key);
  const created = await repos.projects.create({
    name: site.name,
    authorId: staff.id,
    parameters: site.parameters,
    parcel: site.parcel,
    heightmapRef: site.heightmapRef,
    closesAt: site.closesAt,
  });
  if (created.kind !== 'created') throw new Error(`the seed project name ${site.name} is taken`);
  const { project } = created;
  const baseline = await repos.designs.create({
    projectId: project.id,
    authorId: staff.id,
    title: 'Baseline',
    blurb: '',
    document: site.baseline,
    forkedFrom: null,
  });
  await repos.projects.setBaselineDesign(project.id, baseline.id);
  return { id: project.id, baselineDesignId: baseline.id };
}

async function addCommentDirect(
  repos: Repositories,
  comment: Parameters<SeedGateway['addComment']>[0],
): Promise<void> {
  const { designId, authorId, elementId, kind, text } = comment;
  const design = await repos.designs.findById(designId);
  const document = design?.document as DesignDocument | undefined;
  const anchor =
    document === undefined ? undefined : resolveAnchor(document, catalogIndex, { elementId });
  if (anchor?.ok !== true) throw new Error(`no element ${elementId} on ${designId}`);
  await repos.elementComments.upsertOpen({
    designId,
    authorId,
    elementId,
    kind,
    text,
    ...anchor.value,
  });
}

/** A gateway straight over the in-memory repositories; the real one goes through the API. */
function repositoryGateway(repos: Repositories, blobs: SeedBlobLedger): SeedGateway {
  return {
    upsertUser: async (persona) => {
      await repos.users.upsert(persona);
    },
    findProject: async (name) => (await repos.projects.list()).find((p) => p.name === name),
    createProject: (site, staff) => createDirect(repos, blobs, site, staff),
    hasBlob: (key) => Promise.resolve(blobs.keys.has(key)),
    storeBlob: (blob) => {
      blobs.keys.add(blob.key);
      blobs.writes.push(blob.key);
      return Promise.resolve();
    },
    listDesigns: (projectId) => listDirect(repos, projectId),
    submitDesign: (submission) => submitDirect(repos, submission),
    castVote: async ({ voterId, designId, value, reasons }) => {
      await repos.votes.upsertVote({ userId: voterId, designId, value, reasons });
    },
    setSelfReport: async ({ userId, report }) => {
      await repos.users.setSelfReport(userId, report);
    },
    addComment: (comment) => addCommentDirect(repos, comment),
    leaderboard: async (projectId) =>
      rankDesigns(await repos.designs.listByProject(projectId, 'submitted'), PRIOR).map(
        (design, index) => ({
          rank: index + 1,
          designId: design.id,
          title: design.title,
          score: design.score,
        }),
      ),
    counts: (projectId, residents) =>
      countDirect(
        repos,
        projectId,
        residents.map(({ id }) => id),
      ),
  };
}

/** Records each batch of jobs and stores a picture key for each, as the thumbnail route does. */
function recordingThumbnails(repos: Repositories, blobs: SeedBlobLedger) {
  const drawn: ThumbnailJob[][] = [];
  const step: ThumbnailStep = {
    render: async (_site, jobs) => {
      drawn.push([...jobs]);
      for (const { design } of jobs) {
        const stored = await repos.designs.findById(design.id);
        const thumbnailRef = `thumbnails/${design.id}.png`;
        blobs.keys.add(thumbnailRef);
        await repos.designs.setThumbnail(design.id, {
          thumbnailRef,
          expectedUpdatedAt: stored?.updatedAt ?? new Date(0),
        });
      }
      return { mode: 'poster', rendered: jobs.length };
    },
  };
  return { step, drawn };
}

export interface SeedWorld {
  readonly repos: Repositories;
  readonly blobs: SeedBlobLedger;
  readonly thumbnails: ReturnType<typeof recordingThumbnails>;
  readonly options: SeedOptions;
  readonly run: () => Promise<SeedSummary>;
}

/** A fresh in-memory database and blob store that the seed runs against, for seed tests. */
export function seedWorld(plan: SeedPlan): SeedWorld {
  let next = 0;
  const repos = createInMemoryRepositories({
    clock: new FakeClock(START),
    newId: () => `id-${String((next += 1))}`,
  });
  const blobs: SeedBlobLedger = { keys: new Set(), writes: [] };
  const thumbnails = recordingThumbnails(repos, blobs);
  const options: SeedOptions = {
    plan,
    gateway: repositoryGateway(repos, blobs),
    thumbnails: thumbnails.step,
    clock: new FakeClock(START),
  };
  return { repos, blobs, thumbnails, options, run: () => runSeed(options) };
}
