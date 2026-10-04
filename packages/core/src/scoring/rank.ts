import { DEFAULT_SCORE_PRIOR } from '../constants.js';

import { score, type ScorePrior, type VoteTally } from './score.js';

/** A design that can be placed on the leaderboard. */
export interface RankableDesign extends VoteTally {
  readonly id: string;
}

export type RankedDesign<T extends RankableDesign> = T & {
  readonly score: number;
  readonly totalVotes: number;
};

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  // Code-unit order, so the result does not depend on the runtime locale.
  return left < right ? -1 : 1;
}

function compareRanked(left: RankedDesign<RankableDesign>, right: RankedDesign<RankableDesign>) {
  return (
    right.score - left.score || right.totalVotes - left.totalVotes || compareIds(left.id, right.id)
  );
}

/** Sorts by score, highest first, then by total votes, most first, then by id. */
export function rankDesigns<T extends RankableDesign>(
  designs: readonly T[],
  prior: ScorePrior = DEFAULT_SCORE_PRIOR,
): RankedDesign<T>[] {
  return designs
    .map((design) => ({
      ...design,
      score: score(design.up, design.down, prior),
      totalVotes: design.up + design.down,
    }))
    .sort(compareRanked);
}
