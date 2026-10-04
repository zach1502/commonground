import { DEFAULT_SCORE_PRIOR } from '../constants.js';

/** Up and down vote counts for one design. */
export interface VoteTally {
  readonly up: number;
  readonly down: number;
}

/** Pseudo-votes added to every design, so a few early votes cannot top the leaderboard. */
export type ScorePrior = VoteTally;

function assertVoteCount(count: number, name: string): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`${name} must be a whole number of 0 or more, got ${String(count)}`);
  }
}

function assertPrior(prior: ScorePrior): void {
  if (prior.up < 0 || prior.down < 0 || prior.up + prior.down <= 0) {
    throw new RangeError('The score prior needs up and down of 0 or more, with a total above 0');
  }
}

/** Mean of the Beta posterior: (up + prior.up) / (up + down + prior.up + prior.down). */
export function score(up: number, down: number, prior: ScorePrior = DEFAULT_SCORE_PRIOR): number {
  assertVoteCount(up, 'up');
  assertVoteCount(down, 'down');
  assertPrior(prior);
  return (up + prior.up) / (up + down + prior.up + prior.down);
}
