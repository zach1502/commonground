import type { Vote, VoteValue } from './records.js';

export interface CastVote {
  readonly userId: string;
  readonly designId: string;
  readonly value: VoteValue;
  readonly reasons: readonly string[];
  /** Replaces the stored comment; left out, the vote has no comment. */
  readonly comment?: string | null;
}

/** Whose vote on which design a withdraw removes. */
export interface WithdrawVote {
  readonly userId: string;
  readonly designId: string;
}

export interface WithdrawnVote {
  /** 'absent' when the person had no vote on the design, so nothing changed. */
  readonly outcome: 'withdrawn' | 'absent';
  /** The design's counters as the withdraw left them. */
  readonly counts: { readonly up: number; readonly down: number };
}

export interface UpsertedVote {
  readonly vote: Vote;
  readonly outcome: 'created' | 'updated';
  /** The design's counters as this vote's transaction left them. */
  readonly counts: { readonly up: number; readonly down: number };
}

export interface ProjectVoteTotals {
  readonly votes: number;
  readonly uniqueVoters: number;
}

/** One vote per person per design; the design's up and down counters follow every change. */
export interface VoteRepository {
  /**
   * Creates or replaces the vote and adjusts the design counters in one transaction. Throws
   * PhaseClosedError, and writes nothing, when the design's project is closed as the write runs.
   */
  upsertVote(input: CastVote): Promise<UpsertedVote>;
  /**
   * Deletes the person's vote and takes it off the design counters in one step. Throws
   * PhaseClosedError, and deletes nothing, when the design's project is closed as the write runs.
   */
  withdrawVote(input: WithdrawVote): Promise<WithdrawnVote>;
  listByUser(userId: string): Promise<Vote[]>;
  /** Every vote on any design in the project, with its reasons. */
  listByProject(projectId: string): Promise<Vote[]>;
  totalsForProject(projectId: string): Promise<ProjectVoteTotals>;
}
