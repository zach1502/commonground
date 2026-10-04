import { createSeededRandom, type Random, type VoteReason } from '@parkshape/core';

import type { SeedTag } from './fragments.js';
import type { SeedPersona } from './personas.js';

/** A design as the vote plan sees it: the first five targets are the intended top five. */
export interface VoteTarget {
  readonly key: string;
  readonly authorId: string;
  readonly tags: readonly SeedTag[];
}

export interface PlannedVote {
  readonly voterId: string;
  readonly designKey: string;
  readonly value: 1 | -1;
  readonly reasons: readonly VoteReason[];
}

export const TOP_COUNT = 5;
const VOTE_SEED = 2026;
// The top five get 20 votes each, with 19, 18, 17, 16 and 15 up. With the 2 up, 2 down prior
// the fifth scores 17 / 24 = 0.71, above any other design's best of 10 / 16 = 0.63.
const TOP_VOTES = 20;
const TOP_FIRST_UP = 19;
const OTHER_MIN_VOTES = 8;
const OTHER_VOTE_SPREAD = 5;
const OTHER_MIN_UP_SHARE = 0.3;
const OTHER_UP_SHARE_SPREAD = 0.4;
const DOWN_REASONS: readonly VoteReason[] = ['too-expensive', 'too-paved', 'other'];
const TAG_REASONS: Readonly<Record<SeedTag, VoteReason>> = {
  dog: 'dog-area',
  play: 'play',
  water: 'water',
  garden: 'garden',
  trees: 'trees',
  open: 'other',
  paths: 'paths',
};

interface Tally {
  readonly votes: number;
  readonly up: number;
}

function tallyFor(rank: number, random: Random): Tally {
  if (rank < TOP_COUNT) return { votes: TOP_VOTES, up: TOP_FIRST_UP - rank };
  const votes = OTHER_MIN_VOTES + (rank % OTHER_VOTE_SPREAD);
  const share = OTHER_MIN_UP_SHARE + random.next() * OTHER_UP_SHARE_SPREAD;
  return { votes, up: Math.floor(votes * share) };
}

/** A Fisher-Yates shuffle driven by the seeded random, so the order is the same every run. */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    const held = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = held;
  }
  return copy;
}

function upReasons(tags: readonly SeedTag[], random: Random): VoteReason[] {
  const reasons = shuffled([...new Set(tags.map((tag) => TAG_REASONS[tag]))], random);
  return reasons.slice(0, 1 + Math.floor(random.next() * reasons.length));
}

function downReasons(random: Random): VoteReason[] {
  const pick = Math.floor(random.next() * (DOWN_REASONS.length + 1));
  const reason = DOWN_REASONS[pick];
  return reason === undefined ? [] : [reason];
}

/**
 * Who votes on what. Each target gets a fixed number of voters drawn from the residents who did
 * not author it; the first ones vote up. The counts make a clear top five.
 */
export function planVotes(
  targets: readonly VoteTarget[],
  voters: readonly SeedPersona[],
): PlannedVote[] {
  const random = createSeededRandom(VOTE_SEED);
  return targets.flatMap((target, rank) => {
    const tally = tallyFor(rank, random);
    const eligible = voters.filter((voter) => voter.id !== target.authorId);
    return shuffled(eligible, random)
      .slice(0, tally.votes)
      .map((voter, position) => {
        const up = position < tally.up;
        return {
          voterId: voter.id,
          designKey: target.key,
          value: up ? 1 : -1,
          reasons: up ? upReasons(target.tags, random) : downReasons(random),
        } satisfies PlannedVote;
      });
  });
}
