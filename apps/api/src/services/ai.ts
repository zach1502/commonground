import {
  digestDesign,
  sourceOf,
  type AnswerSource,
  type Intent,
  type ReasonCounts,
  type Summary,
} from '@parkshape/ai';
import { rankDesigns, reasonFrequency } from '@parkshape/core';
import type { Repositories } from '@parkshape/db';

import type { AppDeps } from '../deps.js';

import { loadProject, storedDocument, storedParameters } from './access.js';
import { elementFeedbackDigest } from './element-comment-insights.js';
import { insightVote } from './insights.js';

/** The summary looks at the top of the leaderboard only. */
export const SUMMARY_TOP_DESIGNS = 10;

/** How often voters picked each reason chip across every vote in the project. */
async function reasonCounts(repos: Repositories, projectId: string): Promise<ReasonCounts> {
  const votes = (await repos.votes.listByProject(projectId)).map(insightVote);
  const { overall } = reasonFrequency([], votes);
  return Object.fromEntries(overall.map(({ reason, count }) => [reason, count]));
}

/** A summary with who wrote it and how many designs it read. */
export type ProjectSummary = Summary & AnswerSource & { readonly designsRead: number };

/** Themes and tradeoffs across the top 10 live designs and the comment line, from counts only. */
export async function projectSummary(deps: AppDeps, projectId: string): Promise<ProjectSummary> {
  const project = await loadProject(deps.repos, projectId);
  const live = await deps.repos.designs.listByProject(projectId, 'submitted');
  const ranked = rankDesigns(live, storedParameters(project).scoringPrior);
  const topDesigns = ranked
    .slice(0, SUMMARY_TOP_DESIGNS)
    .map((design) =>
      digestDesign({ id: design.id, score: design.score, document: storedDocument(design) }),
    );
  const totals = await deps.repos.votes.totalsForProject(projectId);
  const answer = await deps.ai.summary.summarize({
    topDesigns,
    insights: { designs: live.length, votes: totals.votes, uniqueVoters: totals.uniqueVoters },
    reasonCounts: await reasonCounts(deps.repos, projectId),
    elementFeedback: await elementFeedbackDigest(deps, project),
  });
  // The answer says who wrote it, so a model call that fell back is labelled as the rules.
  return { ...answer.value, ...sourceOf(answer), designsRead: topDesigns.length };
}

/** A resident's description read into an intent for the Describe-it solver. */
export async function describeIntent(
  deps: AppDeps,
  projectId: string,
  text: string,
): Promise<Intent> {
  await loadProject(deps.repos, projectId);
  return (await deps.ai.intent.parse(text)).value;
}
