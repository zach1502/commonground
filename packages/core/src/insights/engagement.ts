import { ENGAGEMENT_SUPPRESS_BELOW } from '../constants.js';
import { AGE_BANDS, type AgeBand } from '../schema/self-report.js';

import type { Participant } from './types.js';

/** A count, or null with suppressed set when fewer than 5 people are in the group. */
export type SuppressedCount =
  | { readonly count: number; readonly suppressed: false }
  | { readonly count: null; readonly suppressed: true };

export type EngagementCell<Group> = SuppressedCount & {
  /** Null for people who did not answer. */
  readonly group: Group | null;
};

export interface EngagementBreakdown {
  readonly byFsa: readonly EngagementCell<string>[];
  readonly byAgeBand: readonly EngagementCell<AgeBand>[];
}

/** Hides small counts so no one can be picked out from their postal area or age. */
export function suppressSmall(count: number): SuppressedCount {
  return count < ENGAGEMENT_SUPPRESS_BELOW
    ? { count: null, suppressed: true }
    : { count, suppressed: false };
}

function cellsFor<Group extends string>(
  answers: readonly (Group | null)[],
  groups: readonly Group[],
): EngagementCell<Group>[] {
  return [...groups, null].map((group) => ({
    group,
    ...suppressSmall(answers.filter((answer) => answer === group).length),
  }));
}

/** Participants by FSA and by age band, with each person counted once. */
export function engagementBreakdown(participants: readonly Participant[]): EngagementBreakdown {
  const unique = [...new Map(participants.map((person) => [person.userId, person])).values()];
  const fsas = unique.map((person) => person.selfReport?.fsa ?? null);
  const ageBands = unique.map((person) => person.selfReport?.ageBand ?? null);
  const seenFsas = [...new Set(fsas.flatMap((fsa) => (fsa === null ? [] : [fsa])))].sort();
  return { byFsa: cellsFor(fsas, seenFsas), byAgeBand: cellsFor(ageBands, AGE_BANDS) };
}
