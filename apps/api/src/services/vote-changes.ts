import type { z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';

import type { voteChangeSchema, withdrawResultSchema } from '../contracts/participation.js';
import type { AppDeps } from '../deps.js';

import { boardChanged } from './leaderboard.js';
import { castVote, loadVotableTarget, whileOpen } from './participation.js';

type VoteChange = z.infer<typeof voteChangeSchema>;
type WithdrawResult = z.infer<typeof withdrawResultSchema>;

/** PUT on the caller's vote: the value, reasons and comment replace what was stored. */
export function setMyVote(deps: AppDeps, session: Session, designId: string, change: VoteChange) {
  return castVote(deps, session, { ...change, designId });
}

/**
 * Removes the caller's vote and takes it off the design's counters, under the same guards and
 * rate limit as casting one. With no vote to remove, the answer says so and the counts stand.
 */
export async function withdrawMyVote(
  deps: AppDeps,
  session: Session,
  designId: string,
): Promise<WithdrawResult> {
  const { design } = await loadVotableTarget(deps, session, designId);
  const ids = { userId: session.userId, designId: design.id };
  const { outcome, counts } = await whileOpen(() => deps.repos.votes.withdrawVote(ids));
  if (outcome === 'withdrawn') boardChanged(deps, design.projectId);
  return { outcome, design: { id: design.id, ...counts } };
}
