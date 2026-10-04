import type { Clock, DesignDocument, VoteReason } from '@parkshape/core';

import type { DesignStatus } from '../ports/records.js';

import { loadSeedComments, planSeedComments, type PlannedComment } from './comments.js';
import type { SeedBlob, SeedSite } from './jonathan-rogers.js';
import type { SeedPersona } from './personas.js';
import { designKey, type PlannedDesign, type SeedPlan } from './plan.js';
import type { PlannedSelfReport } from './self-reports.js';
import { TOP_COUNT } from './votes.js';

export interface SeedProject {
  readonly id: string;
  /** The park today, a staff-owned draft; null when the project has none. */
  readonly baselineDesignId: string | null;
}

export interface SeededDesign {
  readonly id: string;
  readonly title: string;
  readonly authorId: string;
  readonly status: DesignStatus;
  readonly thumbnailRef: string | null;
  /** The stored document, as the server saved it. */
  readonly document: DesignDocument;
}

export interface DesignSubmission {
  readonly projectId: string;
  readonly author: SeedPersona;
  readonly title: string;
  readonly blurb: string;
  readonly document: DesignDocument;
  /** A draft left by an earlier, interrupted run; it is saved and submitted instead of a new one. */
  readonly draftId?: string;
}

export interface SeedVote {
  readonly voterId: string;
  readonly designId: string;
  readonly value: 1 | -1;
  readonly reasons: readonly VoteReason[];
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly designId: string;
  readonly title: string;
  readonly score: number;
}

export interface SeedCounts {
  readonly designs: number;
  readonly votes: number;
  readonly voters: number;
  readonly selfReports: number;
}

/**
 * What the seed does to the app. The tool behind `pnpm seed` implements it over the API's own
 * handler, so submits run the same server checks and metrics as a resident's.
 */
export interface SeedGateway {
  upsertUser(persona: SeedPersona): Promise<void>;
  findProject(name: string): Promise<SeedProject | undefined>;
  createProject(site: SeedSite, staff: SeedPersona): Promise<SeedProject>;
  /** True when the blob store holds bytes under this key; a stored key can outlive its blob. */
  hasBlob(key: string): Promise<boolean>;
  /** Writes one of the site's files, such as the heightmap, to the blob store. */
  storeBlob(blob: SeedBlob): Promise<void>;
  listDesigns(projectId: string): Promise<SeededDesign[]>;
  submitDesign(submission: DesignSubmission): Promise<SeededDesign>;
  castVote(vote: SeedVote): Promise<void>;
  setSelfReport(planned: PlannedSelfReport): Promise<void>;
  /** Adds the comment, or replaces its text when the author already left one of that kind. */
  addComment(comment: PlannedComment): Promise<void>;
  leaderboard(projectId: string): Promise<LeaderboardEntry[]>;
  counts(projectId: string, residents: readonly SeedPersona[]): Promise<SeedCounts>;
}

/** 'baseline' is the park today, drawn larger for the project page; 'design' is a thumbnail. */
export type ThumbnailPicture = 'design' | 'baseline';

export interface ThumbnailJob {
  readonly design: SeededDesign;
  readonly author: SeedPersona;
  readonly picture: ThumbnailPicture;
}

/** How the thumbnails were drawn: the 3D scene in headless Chromium, or the SVG plan poster. */
export type ThumbnailMode = 'scene' | 'poster' | 'skipped';

export interface ThumbnailReport {
  readonly mode: ThumbnailMode;
  readonly rendered: number;
}

export interface ThumbnailStep {
  render(site: SeedSite, jobs: readonly ThumbnailJob[]): Promise<ThumbnailReport>;
}

export interface SeedOptions {
  readonly plan: SeedPlan;
  readonly gateway: SeedGateway;
  readonly thumbnails: ThumbnailStep;
  readonly clock: Clock;
}

export type SeedPhase = 'project' | 'designs' | 'thumbnails' | 'votes' | 'selfReports' | 'comments';

export interface SeedSummary {
  readonly projectId: string;
  readonly createdDesigns: number;
  readonly counts: SeedCounts;
  readonly topFive: readonly LeaderboardEntry[];
  readonly thumbnails: ThumbnailReport;
  /** Element comments the run added or left as they were. */
  readonly comments: number;
  readonly timingsMs: Readonly<Record<SeedPhase, number>>;
}

/**
 * A database seeded under the memory blob store keeps its rows but not its blobs, so a rerun
 * writes back any site file, such as the heightmap, that the blob store lacks.
 */
async function restoreSiteBlobs(gateway: SeedGateway, site: SeedSite): Promise<void> {
  for (const blob of site.blobs) {
    if (!(await gateway.hasBlob(blob.key))) await gateway.storeBlob(blob);
  }
}

async function ensureProject(options: SeedOptions): Promise<SeedProject> {
  const { gateway, plan } = options;
  await gateway.upsertUser(plan.people.staff);
  for (const resident of plan.people.residents) await gateway.upsertUser(resident);
  const existing = await gateway.findProject(plan.site.name);
  if (existing === undefined) return gateway.createProject(plan.site, plan.people.staff);
  await restoreSiteBlobs(gateway, plan.site);
  return existing;
}

function byKey(designs: readonly SeededDesign[]): Map<string, SeededDesign> {
  return new Map(designs.map((design) => [designKey(design.authorId, design.title), design]));
}

async function ensureDesign(
  gateway: SeedGateway,
  project: SeedProject,
  planned: PlannedDesign,
  existing: SeededDesign | undefined,
): Promise<SeededDesign | undefined> {
  if (existing?.status === 'submitted') return undefined;
  const { document, blurb } = planned.build();
  return gateway.submitDesign({
    projectId: project.id,
    author: planned.author,
    title: planned.title,
    blurb,
    document,
    ...(existing === undefined ? {} : { draftId: existing.id }),
  });
}

async function ensureDesigns(options: SeedOptions, project: SeedProject): Promise<number> {
  const existing = byKey(await options.gateway.listDesigns(project.id));
  let created = 0;
  for (const planned of options.plan.designs) {
    const made = await ensureDesign(options.gateway, project, planned, existing.get(planned.key));
    if (made !== undefined) created += 1;
  }
  return created;
}

async function seededDesigns(options: SeedOptions, project: SeedProject) {
  const stored = byKey(await options.gateway.listDesigns(project.id));
  return options.plan.designs.map((planned) => {
    const design = stored.get(planned.key);
    if (design?.status !== 'submitted') throw new Error(`Seed design missing: ${planned.title}`);
    return { planned, design };
  });
}

/** A design needs a picture when it has no key, or when the blob store lacks that key's bytes. */
async function needsPicture(gateway: SeedGateway, design: SeededDesign): Promise<boolean> {
  return design.thumbnailRef === null || !(await gateway.hasBlob(design.thumbnailRef));
}

/** The park today, when it has no picture the blob store can serve; its author is the staff persona. */
async function baselineJob(options: SeedOptions, project: SeedProject): Promise<ThumbnailJob[]> {
  if (project.baselineDesignId === null) return [];
  const stored = await options.gateway.listDesigns(project.id);
  const baseline = stored.find((design) => design.id === project.baselineDesignId);
  if (baseline === undefined || !(await needsPicture(options.gateway, baseline))) return [];
  return [{ design: baseline, author: options.plan.people.staff, picture: 'baseline' }];
}

/**
 * Every submitted copy of each seeded design. A database can hold two rows with the same author
 * and title, and the gallery shows both, so each copy gets its own picture.
 */
async function seededCopies(options: SeedOptions, project: SeedProject) {
  const planned = new Map(options.plan.designs.map((design) => [design.key, design]));
  const stored = await options.gateway.listDesigns(project.id);
  return stored.flatMap((design) => {
    const plannedDesign = planned.get(designKey(design.authorId, design.title));
    if (plannedDesign === undefined || design.status !== 'submitted') return [];
    return [{ planned: plannedDesign, design }];
  });
}

async function designsWithoutPicture(options: SeedOptions, project: SeedProject) {
  const seeded = await seededCopies(options, project);
  const needed = await Promise.all(
    seeded.map(({ design }) => needsPicture(options.gateway, design)),
  );
  return seeded.filter((_, index) => needed[index] === true);
}

async function drawThumbnails(options: SeedOptions, project: SeedProject) {
  const jobs = (await designsWithoutPicture(options, project))
    .map(({ planned, design }): ThumbnailJob => ({
      design,
      author: planned.author,
      picture: 'design',
    }))
    .concat(await baselineJob(options, project));
  return jobs.length === 0
    ? ({ mode: 'skipped', rendered: 0 } satisfies ThumbnailReport)
    : options.thumbnails.render(options.plan.site, jobs);
}

async function castVotes(options: SeedOptions, project: SeedProject): Promise<void> {
  const ids = new Map(
    (await seededDesigns(options, project)).map(({ planned, design }) => [planned.key, design.id]),
  );
  for (const vote of options.plan.votes) {
    const designId = ids.get(vote.designKey);
    if (designId === undefined) throw new Error(`No design for vote ${vote.designKey}`);
    await options.gateway.castVote({ ...vote, designId });
  }
}

/** The element comments on two showcase designs; a second run replaces the same texts. */
async function addComments(options: SeedOptions, project: SeedProject): Promise<number> {
  const designs = (await seededDesigns(options, project)).map(({ design }) => design);
  const planned = planSeedComments(loadSeedComments(), {
    designs,
    residents: options.plan.people.residents,
  });
  for (const comment of planned) await options.gateway.addComment(comment);
  return planned.length;
}

/** Times one phase on the injected clock. */
async function timed<T>(clock: Clock, run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = clock.now().getTime();
  const value = await run();
  return { value, ms: clock.now().getTime() - started };
}

/**
 * Seeds the demo project. Every step matches on natural keys (project name, design title and
 * author, one vote per person per design), so a second run changes nothing. The one exception is
 * blobs: a second run writes back the heightmap and redraws any picture the blob store lacks.
 */
export async function runSeed(options: SeedOptions): Promise<SeedSummary> {
  const { clock, gateway, plan } = options;
  const project = await timed(clock, () => ensureProject(options));
  const designs = await timed(clock, () => ensureDesigns(options, project.value));
  const thumbnails = await timed(clock, () => drawThumbnails(options, project.value));
  const votes = await timed(clock, () => castVotes(options, project.value));
  const reports = await timed(clock, async () => {
    for (const planned of plan.selfReports) await gateway.setSelfReport(planned);
  });
  const comments = await timed(clock, () => addComments(options, project.value));
  const leaderboard = await gateway.leaderboard(project.value.id);
  return {
    projectId: project.value.id,
    createdDesigns: designs.value,
    counts: await gateway.counts(project.value.id, plan.people.residents),
    topFive: leaderboard.slice(0, TOP_COUNT),
    thumbnails: thumbnails.value,
    comments: comments.value,
    timingsMs: {
      project: project.ms,
      designs: designs.ms,
      thumbnails: thumbnails.ms,
      votes: votes.ms,
      selfReports: reports.ms,
      comments: comments.ms,
    },
  };
}
