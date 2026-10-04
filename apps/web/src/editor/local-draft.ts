const KEY_PREFIX = 'parkshape:draft:';

/**
 * The newest document on this device. "unsynced" holds changes the server has not confirmed;
 * `baseUpdatedAt` is the server stamp those changes started from, sent back as the save's
 * expectedUpdatedAt. Stamps are only ever compared for equality, so the device clock never counts.
 */
export interface LocalDraft {
  readonly document: unknown;
  readonly baseUpdatedAt: string;
  readonly state: 'synced' | 'unsynced';
}

/** A draft as the server holds it: its document and the stamp of its last save. */
export interface ServerDraft {
  readonly document: unknown;
  readonly updatedAt: string;
}

export interface ReconciledDraft {
  readonly document: unknown;
  /** "local" means the device has changes the server lacks, so the editor sends them. */
  readonly source: 'server' | 'local';
  /** The stamp the next save sends; a stale one makes the server answer 409. */
  readonly expectedUpdatedAt: string;
}

export function localDraftKey(designId: string): string {
  return `${KEY_PREFIX}${designId}`;
}

function isLocalDraft(value: unknown): value is LocalDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<LocalDraft>;
  return (
    'document' in draft &&
    typeof draft.baseUpdatedAt === 'string' &&
    (draft.state === 'synced' || draft.state === 'unsynced')
  );
}

export function readLocalDraft(storage: Storage, designId: string): LocalDraft | null {
  const text = storage.getItem(localDraftKey(designId));
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isLocalDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Stores the draft; a full or blocked store only loses the device copy, never the edit. */
export function writeLocalDraft(storage: Storage, designId: string, draft: LocalDraft): void {
  try {
    storage.setItem(localDraftKey(designId), JSON.stringify(draft));
  } catch {
    // The server copy and the tab's session copy still hold the change.
  }
}

/** Removes one design's device copy, after the reader took the saved version instead. */
export function forgetLocalDraft(storage: Storage, designId: string): void {
  storage.removeItem(localDraftKey(designId));
}

/** Removes every design's device copy on sign-out, so the next person here never loads one. */
export function forgetLocalDrafts(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (key?.startsWith(KEY_PREFIX) === true) storage.removeItem(key);
  }
}

/** Records the server copy and its stamp as what this device holds. */
export function markDraftSynced(storage: Storage, designId: string, server: ServerDraft): void {
  writeLocalDraft(storage, designId, {
    document: server.document,
    baseUpdatedAt: server.updatedAt,
    state: 'synced',
  });
}

/**
 * What opens when the server copy moved on after this device's unsynced changes began.
 * "reopen-local" opens them, so the save gets 409 and the reader chooses; "take-server" is for
 * a caller with no save to ask with, such as the wizard baseline.
 */
export type ServerMovedPolicy = 'reopen-local' | 'take-server';

/**
 * Unsynced changes on this device open with the stamp they started from: if the server moved on
 * since, the save gets 409 and the reader chooses, so neither copy is dropped silently. With no
 * unsynced changes the server copy opens.
 */
export function reconcileDraft(
  server: ServerDraft,
  local: LocalDraft | null,
  whenServerMoved: ServerMovedPolicy = 'reopen-local',
): ReconciledDraft {
  const serverWins =
    local === null ||
    local.state === 'synced' ||
    (whenServerMoved === 'take-server' && local.baseUpdatedAt !== server.updatedAt);
  if (serverWins) {
    return { document: server.document, source: 'server', expectedUpdatedAt: server.updatedAt };
  }
  return { document: local.document, source: 'local', expectedUpdatedAt: local.baseUpdatedAt };
}

export interface SavedDraft {
  /** The document the editor sent. */
  readonly sent: unknown;
  /** The draft as the server stored it, with its new stamp. */
  readonly stored: ServerDraft;
}

export interface DraftTracker {
  /** A new document in the editor, not yet on the server. */
  readonly changed: (document: unknown) => void;
  /** The server saved a document; `current` is the editor's document now. */
  readonly saved: (saved: SavedDraft, current: unknown) => void;
  /** The stamp the next save sends as expectedUpdatedAt. */
  readonly expected: () => string;
  /** Starts from a newer stamp, so the next save of `current` overwrites that version. */
  readonly rebase: (updatedAt: string, current: unknown) => void;
  /** Takes a stamp and writes nothing, for when the device copy was dropped. */
  readonly adopt: (updatedAt: string) => void;
}

/** Keeps the device copy of one design current, and the server stamp its changes start from. */
export function trackDraft(storage: Storage, designId: string, stamp: string): DraftTracker {
  let base = stamp;
  const unsynced = (document: unknown) => {
    writeLocalDraft(storage, designId, { document, baseUpdatedAt: base, state: 'unsynced' });
  };
  return {
    changed: unsynced,
    saved: ({ sent, stored }, current) => {
      base = stored.updatedAt;
      if (sent === current) markDraftSynced(storage, designId, stored);
      else unsynced(current);
    },
    expected: () => base,
    rebase: (updatedAt, current) => {
      base = updatedAt;
      unsynced(current);
    },
    adopt: (updatedAt) => {
      base = updatedAt;
    },
  };
}
