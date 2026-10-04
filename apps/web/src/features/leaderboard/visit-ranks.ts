/** What the reader saw on a project's leaderboard last time, and whether they voted since. */
export interface Visit {
  readonly ranks: ReadonlyMap<string, number>;
  readonly votedSinceLastVisit: boolean;
}

/** The last leaderboard ranks shown per project, kept in sessionStorage for this tab. */
export interface VisitStore {
  readonly read: (projectId: string) => Visit | null;
  readonly saveRanks: (projectId: string, ranks: ReadonlyMap<string, number>) => void;
  /** A vote was recorded, so the next leaderboard view may show the rows it moved. */
  readonly markVoted: (projectId: string) => void;
  /** The reorder ran, so later views stay still until the next vote. */
  readonly clearVoted: (projectId: string) => void;
}

const KEY_PREFIX = 'parkshape.leaderboard.';

interface StoredVisit {
  readonly ranks: Readonly<Record<string, number>>;
  readonly votedSinceLastVisit: boolean;
}

const isRank = (value: unknown): boolean => Number.isInteger(value) && Number(value) > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A hand-written guard: zod here would put its chunk on the vote route's critical path. */
function isStoredVisit(value: unknown): value is StoredVisit {
  if (!isRecord(value) || typeof value.votedSinceLastVisit !== 'boolean') return false;
  return isRecord(value.ranks) && Object.values(value.ranks).every(isRank);
}

function parse(text: string | null): StoredVisit | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isStoredVisit(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Reads and writes the visit record. Storage can throw in a private or locked-down browser; then
 * the reader simply gets no reorder, which is the same as a first visit.
 */
export function createVisitStore(storage: Pick<Storage, 'getItem' | 'setItem'>): VisitStore {
  const load = (projectId: string): StoredVisit | null => {
    try {
      return parse(storage.getItem(KEY_PREFIX + projectId));
    } catch {
      return null;
    }
  };
  const save = (projectId: string, visit: StoredVisit) => {
    try {
      storage.setItem(KEY_PREFIX + projectId, JSON.stringify(visit));
    } catch {
      // Nothing to keep; the next view behaves as a first visit.
    }
  };
  const update = (projectId: string, change: Partial<StoredVisit>) => {
    const current = load(projectId) ?? { ranks: {}, votedSinceLastVisit: false };
    save(projectId, { ...current, ...change });
  };
  return {
    read: (projectId) => {
      const visit = load(projectId);
      if (visit === null) return null;
      return {
        ranks: new Map(Object.entries(visit.ranks)),
        votedSinceLastVisit: visit.votedSinceLastVisit,
      };
    },
    saveRanks: (projectId, ranks) => {
      update(projectId, { ranks: Object.fromEntries(ranks) });
    },
    markVoted: (projectId) => {
      update(projectId, { votedSinceLastVisit: true });
    },
    clearVoted: (projectId) => {
      update(projectId, { votedSinceLastVisit: false });
    },
  };
}
