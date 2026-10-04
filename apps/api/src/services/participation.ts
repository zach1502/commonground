import type { z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import {
  QUEUE_UNDER_VOTED_SHARE,
  THUMBNAIL_HEIGHT_PX,
  THUMBNAIL_PLACEHOLDER_COLOUR,
  THUMBNAIL_WIDTH_PX,
  pickQueue,
  type VoteReason,
} from '@parkshape/core';
import { PhaseClosedError, type CastVote, type Vote, type VoteTarget } from '@parkshape/db';

import type {
  queuePosterSchema,
  voteBodySchema,
  voteResultSchema,
} from '../contracts/participation.js';
import type { AppDeps } from '../deps.js';
import { forbidden, phaseClosed, wrongStatus } from '../errors.js';
import { presentProject, presentSummaries, viewerFor } from '../presenters.js';

import {
  assertOpen,
  loadProject,
  loadVisibleSummary,
  loadVoteTarget,
  takeToken,
} from './access.js';
import { boardChanged } from './leaderboard.js';

type VoteBody = z.infer<typeof voteBodySchema>;
type VoteResult = z.infer<typeof voteResultSchema>;
type QueuePoster = z.infer<typeof queuePosterSchema>;

/** A stored vote as the voter reads it back. */
export function presentVote(vote: Vote) {
  return {
    id: vote.id,
    designId: vote.designId,
    value: vote.value,
    reasons: [...vote.reasons] as VoteReason[],
    comment: vote.comment,
    createdAt: vote.createdAt.toISOString(),
    updatedAt: vote.updatedAt.toISOString(),
  };
}

/**
 * The checks every vote write makes, in order: the rate limit, a design the caller may see (404
 * alike for one that is missing or hidden), not their own, live, and an open project.
 */
export async function loadVotableTarget(
  deps: AppDeps,
  session: Session,
  designId: string,
): Promise<VoteTarget> {
  await takeToken(deps.limits.votes, session.userId, 'votes');
  const target = await loadVoteTarget(deps.repos, designId, session.userId);
  if (target.design.authorId === session.userId) {
    throw forbidden('You cannot vote on your own design.');
  }
  if (target.design.status !== 'submitted') {
    throw wrongStatus('Only live designs can get votes.');
  }
  assertOpen(target.project, deps.clock);
  return target;
}

/** Runs a vote write, answering phase-closed when the project closed as it ran. */
export async function whileOpen<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof PhaseClosedError) throw phaseClosed();
    throw error;
  }
}

/**
 * Records or changes the caller's vote; the repository writes the vote and the counters in single
 * statements, and the counts in the answer are the ones those statements wrote. The phase guard
 * here answers early; the vote statement checks the project again, so a close that lands after
 * the guard still refuses it.
 */
export async function castVote(
  deps: AppDeps,
  session: Session,
  body: VoteBody,
): Promise<VoteResult> {
  const { design } = await loadVotableTarget(deps, session, body.designId);
  const cast: CastVote = {
    userId: session.userId,
    designId: body.designId,
    value: body.value,
    reasons: body.reasons,
    comment: body.comment ?? null,
  };
  const { vote, outcome, counts } = await whileOpen(() => deps.repos.votes.upsertVote(cast));
  boardChanged(deps, design.projectId);
  return { outcome, vote: presentVote(vote), design: { id: design.id, ...counts } };
}

/** A review batch that skips the caller's own designs and any they already voted on. */
export async function reviewQueue(
  deps: AppDeps,
  session: Session,
  projectId: string,
  size: number,
) {
  const project = await loadProject(deps.repos, projectId);
  const candidates = await deps.repos.designs.listQueueCandidates(projectId);
  const viewer = await viewerFor(deps.repos, session);
  const own = candidates.filter((design) => design.authorId === session.userId);
  const excluded = new Set([...own.map(({ id }) => id), ...viewer.votedDesignIds]);
  const picked = pickQueue(candidates, excluded, size, {
    underVotedShare: QUEUE_UNDER_VOTED_SHARE,
    random: deps.queueRandom(session.userId),
  });
  // Only the picked designs are presented, so only they are read in full.
  const designs = await deps.repos.designs.findSummariesByIds(picked.map(({ id }) => id));
  const summaries = await presentSummaries(deps.repos, designs, viewer, (key) =>
    deps.blobStore.url(key),
  );
  return {
    project: presentProject(project, deps.clock.now()),
    designs: summaries,
    baselineDesignId: project.baselineDesignId,
    poster: posterOf(summaries),
  };
}

/**
 * The first card's picture with its size, so the page can preload it and hold its space.
 * Every stored thumbnail is drawn at the same size, so the size is a constant.
 */
function posterOf(
  summaries: readonly { readonly id: string; readonly thumbnailUrl: string | null }[],
): QueuePoster | null {
  const [first] = summaries;
  if (first === undefined) return null;
  if (first.thumbnailUrl === null) return null;
  return {
    designId: first.id,
    url: first.thumbnailUrl,
    width: THUMBNAIL_WIDTH_PX,
    height: THUMBNAIL_HEIGHT_PX,
    placeholder: THUMBNAIL_PLACEHOLDER_COLOUR,
  };
}

/** The caller's own vote on one design, or null; drafts stay private to their author. */
export async function myVote(deps: AppDeps, session: Session, designId: string) {
  await loadVisibleSummary(deps.repos, designId, session.userId);
  const votes = await deps.repos.votes.listByUser(session.userId);
  const found = votes.find((vote) => vote.designId === designId);
  if (found === undefined) {
    return { vote: null };
  }
  return { vote: presentVote(found) };
}
