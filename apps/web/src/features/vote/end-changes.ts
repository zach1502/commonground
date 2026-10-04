import type { CastVoteInput } from '../../api/web-api';

import type { StoredVote, VoteChangeApi } from './use-vote-change';
import type { VoteResult } from './vote-batch';

/** What the end of a batch needs to change or withdraw the votes the batch cast. */
export interface EndChanges {
  readonly api: VoteChangeApi;
  /** The last vote the batch sent for each design; a skipped design has none. */
  readonly sent: ReadonlyMap<string, CastVoteInput>;
  /** Resolves once the batch's own queued votes have been tried, so a change lands after them. */
  readonly before: () => Promise<void>;
  /** The design at `index` now reads `result`, at once or after a rollback. */
  readonly onResult: (index: number, result: VoteResult) => void;
  /** The server has the change for the design. */
  readonly onStored: (designId: string) => void;
}

/** The stored vote a batch send stands for; the batch sends no comment. */
export function sentVote(input: CastVoteInput | undefined): StoredVote | null {
  if (input === undefined) return null;
  return { value: input.value, reasons: input.reasons, comment: null };
}

/** How a row on the end screen reads the vote now shown. */
export function resultOf(vote: StoredVote | null): VoteResult {
  if (vote === null) return 'skipped';
  return vote.value === 1 ? 'up' : 'down';
}
