import type { RankDirection } from '@parkshape/ui';

export interface RankChangeResult {
  readonly direction: RankDirection;
  /** How many places the design moved, always 0 or more. */
  readonly places: number;
}

/** Rank numbers keyed by design id, taken from an ordered list of ids (rank 1 is first). */
export function ranksById(orderedIds: readonly string[]): Map<string, number> {
  return new Map(orderedIds.map((id, index) => [id, index + 1]));
}

/**
 * How a design's rank moved since the last snapshot. A smaller rank number is higher, so a design
 * that went from rank 4 to rank 2 moved up 2. Designs missing from the snapshot are unchanged.
 */
export function rankChangeFor(
  designId: string,
  currentRank: number,
  previous: ReadonlyMap<string, number>,
): RankChangeResult {
  const before = previous.get(designId);
  if (before === undefined || before === currentRank) {
    return { direction: 'same', places: 0 };
  }
  return before > currentRank
    ? { direction: 'up', places: before - currentRank }
    : { direction: 'down', places: currentRank - before };
}

/** "some" when any design moved since the last snapshot; the Change column hides on "none". */
export function anyRankChanged(
  rows: readonly { readonly id: string; readonly rank: number }[],
  previous: ReadonlyMap<string, number>,
): 'some' | 'none' {
  return rows.some((row) => rankChangeFor(row.id, row.rank, previous).direction !== 'same')
    ? 'some'
    : 'none';
}

const PERCENT = 100;

/** The score as a bare whole percent; the column header carries the unit. */
export function scorePercent(score: number): string {
  return String(Math.round(score * PERCENT));
}
