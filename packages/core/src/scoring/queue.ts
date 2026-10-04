import type { Random } from '../ports/random.js';

import type { VoteTally } from './score.js';

/** A design that may be served to a voter for review. */
export interface QueueCandidate extends VoteTally {
  readonly id: string;
  readonly authorId: string;
}

export interface QueueOptions {
  /** Share of the batch, from 0 to 1, drawn from the under-voted group. */
  readonly underVotedShare: number;
  readonly random: Random;
}

export interface VoteSplit<T> {
  readonly underVoted: readonly T[];
  readonly rest: readonly T[];
}

interface Sample<T> {
  readonly picked: T[];
  readonly left: T[];
}

const HALF = 2;

const votesOf = (design: VoteTally): number => design.up + design.down;

/** Fisher-Yates shuffle into a new array. */
function shuffle<T>(items: readonly T[], random: Random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex] as T, shuffled[index] as T];
  }
  return shuffled;
}

/** Picks `count` items uniformly without replacement and returns the rest too. */
function sample<T>(items: readonly T[], count: number, random: Random): Sample<T> {
  const shuffled = shuffle(items, random);
  return { picked: shuffled.slice(0, count), left: shuffled.slice(count) };
}

function median(sortedCounts: readonly number[]): number {
  const middle = Math.floor(sortedCounts.length / HALF);
  const upper = sortedCounts[middle] ?? 0;
  if (sortedCounts.length % HALF === 1) return upper;
  return ((sortedCounts[middle - 1] ?? 0) + upper) / HALF;
}

/**
 * Splits designs into those with fewer votes than the median and the rest. When ties leave
 * nothing below the median, the lowest-count half is under-voted instead. Ties are ordered at
 * random, so a pool of new designs with no votes does not always favour the same half.
 */
export function splitUnderVoted<T extends VoteTally>(
  designs: readonly T[],
  random: Random,
): VoteSplit<T> {
  const byVotes = shuffle(designs, random).sort((left, right) => votesOf(left) - votesOf(right));
  const medianVotes = median(byVotes.map(votesOf));
  const belowMedian = byVotes.filter((design) => votesOf(design) < medianVotes).length;
  const underCount = belowMedian > 0 ? belowMedian : Math.floor(byVotes.length / HALF);
  return { underVoted: byVotes.slice(0, underCount), rest: byVotes.slice(underCount) };
}

function assertQueueRequest(n: number, underVotedShare: number): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`n must be a whole number of 0 or more, got ${String(n)}`);
  }
  if (!(underVotedShare >= 0 && underVotedShare <= 1)) {
    throw new RangeError(`underVotedShare must be from 0 to 1, got ${String(underVotedShare)}`);
  }
}

/**
 * Picks up to `n` designs for one review batch. round(n x underVotedShare) slots go to
 * under-voted designs, the other slots go to the rest, and leftover under-voted designs fill any
 * slots the rest cannot. Every pick is uniform and the final order is shuffled.
 */
export function pickQueue<T extends QueueCandidate>(
  candidates: readonly T[],
  excludedIds: ReadonlySet<string>,
  n: number,
  options: QueueOptions,
): T[] {
  assertQueueRequest(n, options.underVotedShare);
  const { random } = options;
  const eligible = candidates.filter((design) => !excludedIds.has(design.id));
  const split = splitUnderVoted(eligible, random);
  const under = sample(split.underVoted, Math.round(n * options.underVotedShare), random);
  const rest = sample(split.rest, n - under.picked.length, random);
  const topUp = sample(under.left, n - under.picked.length - rest.picked.length, random);
  return shuffle([...under.picked, ...rest.picked, ...topUp.picked], random);
}
