import type { Session } from '@parkshape/auth';
import { rankDesigns } from '@parkshape/core';

import type { AppDeps } from '../deps.js';
import { authorsFor, presentDesignSummary, viewerFor } from '../presenters.js';
import type { RankedBoard } from '../ranked-board.js';

import { loadProject, storedParameters } from './access.js';

async function rankedBoard(deps: AppDeps, projectId: string): Promise<RankedBoard> {
  const project = await loadProject(deps.repos, projectId);
  const live = await deps.repos.designs.listSummariesByProject(projectId, 'submitted');
  const prior = storedParameters(project).scoringPrior;
  const urlFor = (key: string) => deps.blobStore.url(key);
  return {
    prior: { up: prior.up, down: prior.down },
    entries: rankDesigns(live, prior).map((design) => ({
      design,
      score: design.score,
      summary: presentDesignSummary(design, null, urlFor),
    })),
  };
}

/**
 * The ranked board, from the per-project cache when it is under LEADERBOARD_CACHE_MS old.
 * Authors depend on who asks, so they are resolved for each read.
 */
export async function leaderboard(deps: AppDeps, session: Session | undefined, projectId: string) {
  const board = await deps.leaderboardCache.get(projectId, () => rankedBoard(deps, projectId));
  const viewer = await viewerFor(deps.repos, session);
  const authors = await authorsFor(
    deps.repos,
    board.entries.map((entry) => entry.design),
    viewer,
  );
  return {
    prior: board.prior,
    entries: board.entries.map((entry, index) => ({
      rank: index + 1,
      score: entry.score,
      design: { ...entry.summary, author: authors.get(entry.design.id) ?? null },
    })),
  };
}

/** Called after a vote or submit changes a project's board, so the next read is fresh. */
export function boardChanged(deps: Pick<AppDeps, 'leaderboardCache'>, projectId: string): void {
  deps.leaderboardCache.invalidate(projectId);
}
