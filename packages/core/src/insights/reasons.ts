import { VOTE_REASONS, type VoteReason } from '../schema/vote.js';

import type { InsightDesign, InsightVote } from './types.js';

export interface ReasonCount {
  readonly reason: VoteReason;
  readonly count: number;
}

export interface DesignReasons {
  readonly designId: string;
  readonly title: string;
  readonly votes: number;
  readonly counts: readonly ReasonCount[];
}

export interface ReasonFrequency {
  /** Every vote in the project, including votes on designs no longer live. */
  readonly overall: readonly ReasonCount[];
  /** The same count over up votes only. */
  readonly up: readonly ReasonCount[];
  /** The same count over down votes only. */
  readonly down: readonly ReasonCount[];
  /** Live designs in the order given. */
  readonly byDesign: readonly DesignReasons[];
}

function countReasons(votes: readonly InsightVote[]): ReasonCount[] {
  return VOTE_REASONS.map((reason) => ({
    reason,
    count: votes.filter((vote) => vote.reasons.includes(reason)).length,
  }));
}

/** How often voters picked each reason chip, overall, by vote direction and for each design. */
export function reasonFrequency(
  designs: readonly InsightDesign[],
  votes: readonly InsightVote[],
): ReasonFrequency {
  return {
    overall: countReasons(votes),
    up: countReasons(votes.filter((vote) => vote.value === 1)),
    down: countReasons(votes.filter((vote) => vote.value === -1)),
    byDesign: designs.map((design) => {
      const own = votes.filter((vote) => vote.designId === design.id);
      return {
        designId: design.id,
        title: design.title,
        votes: own.length,
        counts: countReasons(own),
      };
    }),
  };
}
