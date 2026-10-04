import {
  designDocumentSchema,
  parcelSchema,
  projectParametersSchema,
  projectPhase,
  type Clock,
  type PhaseInput,
  type DesignDocument,
  type Parcel,
} from '@parkshape/core';
import type { Design, DesignSummary, Project, Repositories, VoteTarget } from '@parkshape/db';

import { ApiError, notFound, phaseClosed } from '../errors.js';
import type { TokenBucketLimiter } from '../rate-limit.js';

const MS_PER_SECOND = 1000;

export async function loadProject(repos: Repositories, id: string): Promise<Project> {
  const project = await repos.projects.findById(id);
  if (project === undefined) {
    throw notFound('Project');
  }
  return project;
}

export async function loadDesign(repos: Repositories, id: string): Promise<Design> {
  const design = await repos.designs.findById(id);
  if (design === undefined) {
    throw notFound('Design');
  }
  return design;
}

/** The baseline is a staff-owned draft that every signed-in user compares designs against. */
async function isProjectBaseline(repos: Repositories, design: DesignSummary): Promise<boolean> {
  const project = await repos.projects.findById(design.projectId);
  return project?.baselineDesignId === design.id;
}

/**
 * Drafts are private: to anyone but the author they do not exist. The one exception is the
 * project's baseline, which any signed-in user may read for "Compare with today".
 */
export async function loadVisibleDesign(
  repos: Repositories,
  id: string,
  viewerId: string | undefined,
): Promise<Design> {
  return visibleTo(repos, await loadDesign(repos, id), viewerId);
}

/** loadVisibleDesign without the document, for checks such as a vote's. */
export async function loadVisibleSummary(
  repos: Repositories,
  id: string,
  viewerId: string | undefined,
): Promise<DesignSummary> {
  const design = await repos.designs.findSummaryById(id);
  if (design === undefined) {
    throw notFound('Design');
  }
  return visibleTo(repos, design, viewerId);
}

/**
 * The design a vote names with its project's phase, in one read. Visibility follows
 * loadVisibleDesign; the baseline check reads the joined project instead of loading it again.
 */
export async function loadVoteTarget(
  repos: Repositories,
  id: string,
  viewerId: string,
): Promise<VoteTarget> {
  const target = await repos.designs.findVoteTarget(id);
  if (target === undefined) throw notFound('Design');
  const { design, project } = target;
  if (design.status !== 'draft' || design.authorId === viewerId) return target;
  if (project.baselineDesignId === design.id) return target;
  throw notFound('Design');
}

async function visibleTo<T extends DesignSummary>(
  repos: Repositories,
  design: T,
  viewerId: string | undefined,
): Promise<T> {
  if (design.status !== 'draft' || design.authorId === viewerId) return design;
  if (viewerId !== undefined && (await isProjectBaseline(repos, design))) return design;
  throw notFound('Design');
}

/** Submits, votes and new drafts need the open phase: staff status and closing day together. */
export function assertOpen(project: PhaseInput, clock: Clock): void {
  if (projectPhase(project, clock.now()) === 'closed') {
    throw phaseClosed();
  }
}

export async function takeToken(
  limiter: TokenBucketLimiter,
  key: string,
  action: string,
): Promise<void> {
  const result = await limiter.take(key);
  if (result.kind === 'limited') {
    const retryAfterSeconds = Math.ceil(result.retryAfterMs / MS_PER_SECOND);
    throw new ApiError('rate-limited', `Too many ${action}. Try again in a moment.`, {
      retryAfterSeconds,
    });
  }
}

/**
 * Takes a token, then runs the action. When the action throws, and so answers an error, the token
 * goes back, so a try that changed nothing costs nothing. A refund that fails is dropped: the
 * action's own error is the answer, and a lost refund costs the person one token at most.
 */
export async function spendTokenOn<T>(
  limiter: TokenBucketLimiter,
  key: string,
  action: string,
  run: () => Promise<T>,
): Promise<T> {
  await takeToken(limiter, key, action);
  try {
    return await run();
  } catch (error) {
    await limiter.refund(key).catch(() => undefined);
    throw error;
  }
}

export function storedDocument(design: Design): DesignDocument {
  return designDocumentSchema.parse(design.document);
}

/** The project's baseline document, the park as it is today, or undefined when it has none. */
export async function storedBaseline(
  repos: Repositories,
  project: Project,
): Promise<DesignDocument | undefined> {
  if (project.baselineDesignId === null) return undefined;
  const baseline = await repos.designs.findById(project.baselineDesignId);
  return baseline === undefined ? undefined : storedDocument(baseline);
}

export function storedParameters(project: Project) {
  return projectParametersSchema.parse(project.parameters);
}

export function storedParcel(project: Project): Parcel {
  return parcelSchema.parse(project.parcel);
}
