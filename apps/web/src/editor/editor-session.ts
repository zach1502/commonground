import {
  designDocumentSchema,
  makeFlatHeightmap,
  parcelGrid,
  withGroundOutline,
  type CatalogIndex,
  type DesignDocument,
  type Heightmap,
  type Parcel,
  type Random,
  type Zone,
} from '@parkshape/core';
import {
  createEditorContext,
  createEditorStore,
  historyStorageKey,
  hintsStorageKey,
  parseHints,
  parseSession,
  serialiseHints,
  serialiseSession,
  type EditorContext,
} from '@parkshape/scene/editor';

import {
  forgetLocalDraft,
  markDraftSynced,
  readLocalDraft,
  reconcileDraft,
  trackDraft,
  type SavedDraft,
  type ServerMovedPolicy,
} from './local-draft';

export interface EditorStorage {
  /** Holds the undo history for this browser session. */
  readonly session: Storage;
  /** Holds which first-visit hints each user dismissed, and each design's newest document. */
  readonly local: Storage;
}

export interface EditorSessionInput {
  readonly designId: string;
  readonly userId: string;
  /** The draft as the API has it. */
  readonly document: DesignDocument;
  /** The API's stamp for that draft, sent back with the first save. */
  readonly updatedAt: string;
  /** What opens when the server copy moved on after unsynced local changes; see reconcileDraft. */
  readonly whenServerMoved?: ServerMovedPolicy;
  readonly parcel: Parcel;
  readonly zones: readonly Zone[];
  readonly catalog: CatalogIndex;
  readonly random: Random;
  readonly storage: EditorStorage;
  /** The project's recorded ground; null or absent draws the flat parcel grid. */
  readonly terrain?: Heightmap | null | undefined;
  /** The project's cut and fill band and root-zone rule, for the terraform tools. */
  readonly terraform?: { readonly maxDeviationM: number; readonly rootZonePerDbhCm: number };
}

export interface EditorSession {
  readonly ctx: EditorContext;
  readonly dispose: () => void;
  /** "push" when this device holds changes the server has not seen, so they go out at once. */
  readonly sync: 'push' | 'none';
  /** Records a save the server confirmed: what the editor sent and what the server stored. */
  readonly markSaved: (saved: SavedDraft) => void;
  /** The stamp the next save sends as expectedUpdatedAt. */
  readonly expectedUpdatedAt: () => string;
  /** After a 409: keep this tab's document and overwrite the version saved at `updatedAt`. */
  readonly keepMine: (current: { readonly updatedAt: string }) => void;
  /** After a 409: open the saved version, drop the undo history and the device copy. */
  readonly useSaved: (current: SavedVersion) => void;
}

/** A draft version the server holds, as a 409 returns it. */
export interface SavedVersion {
  readonly document: DesignDocument;
  readonly updatedAt: string;
}

/**
 * Terrain for the editor: the project's recorded heightmap, or the flat parcel grid when it has
 * none, cut to the parcel outline when the parcel is not its grid box. The API measures a
 * submission on the same ground, so the editor and the submit check agree.
 */
export function terrainFor(parcel: Parcel, recorded?: Heightmap | null): Heightmap {
  return withGroundOutline(recorded ?? makeFlatHeightmap(parcelGrid(parcel)), parcel.polygon);
}

type Restored = ReturnType<typeof parseSession>;

/** The copy the editor opens, the stamp its first save sends, and whether that save goes now. */
interface Opening {
  readonly document: DesignDocument;
  readonly restored: Restored;
  readonly expectedUpdatedAt: string;
  readonly sync: 'push' | 'none';
  /** "server" when the API copy opens as it is, so the device copy is marked synced with it. */
  readonly source: 'server' | 'device';
}

/** Unsynced changes on this device, when there are any and they open; null otherwise. */
function unsyncedOpening(input: EditorSessionInput, restored: Restored): Opening | null {
  const local = readLocalDraft(input.storage.local, input.designId);
  const server = { document: input.document, updatedAt: input.updatedAt };
  const picked = reconcileDraft(server, local, input.whenServerMoved);
  const parsed = designDocumentSchema.safeParse(picked.document);
  if (picked.source !== 'local' || !parsed.success) return null;
  const { expectedUpdatedAt } = picked;
  return { document: parsed.data, restored, expectedUpdatedAt, sync: 'push', source: 'device' };
}

/**
 * The tab's session copy opens from the stamp this device last saved, which the API copy may not
 * match: another tab saved since, or the API copy is the offline snapshot. The save that goes out
 * then either matches or gets 409 and asks, so neither copy rolls the other back.
 */
function sessionOpening(input: EditorSessionInput, restored: NonNullable<Restored>): Opening {
  const local = readLocalDraft(input.storage.local, input.designId);
  const known = local?.baseUpdatedAt ?? input.updatedAt;
  const moved = known !== input.updatedAt && input.whenServerMoved !== 'take-server';
  return {
    document: restored.document,
    restored,
    expectedUpdatedAt: known,
    sync: moved ? 'push' : 'none',
    source: local === null ? 'server' : 'device',
  };
}

/** Which copy opens: unsynced changes, then the tab's session copy, then the API copy. */
function opening(input: EditorSessionInput): Opening {
  const restored = parseSession(input.storage.session.getItem(historyStorageKey(input.designId)));
  const unsynced = unsyncedOpening(input, restored);
  if (unsynced !== null) return unsynced;
  if (restored !== null) return sessionOpening(input, restored);
  const { document, updatedAt } = input;
  return { document, restored, expectedUpdatedAt: updatedAt, sync: 'none', source: 'server' };
}

/**
 * Opens the store for one design. Unsynced changes on this device win and go out at once with
 * the stamp they started from, so a server copy that moved on answers 409 and the reader chooses.
 * Otherwise the session copy wins over the API copy, since it is the newest state in this tab.
 */
export function openEditorSession(input: EditorSessionInput): EditorSession {
  const { storage, designId } = input;
  const historyKey = historyStorageKey(designId);
  const hintsKey = hintsStorageKey(input.userId);
  const opened = opening(input);
  const { restored } = opened;
  const store = createEditorStore({
    document: opened.document,
    ...(restored === null ? {} : { history: restored.history }),
    hints: parseHints(storage.local.getItem(hintsKey)),
  });
  const draft = trackDraft(storage.local, designId, opened.expectedUpdatedAt);
  if (opened.source === 'server') markDraftSynced(storage.local, designId, input);
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.history !== previous.history || state.document !== previous.document) {
      storage.session.setItem(
        historyKey,
        serialiseSession({ document: state.document, history: state.history }),
      );
    }
    if (state.document !== previous.document) draft.changed(state.document);
    if (state.hints !== previous.hints) {
      storage.local.setItem(hintsKey, serialiseHints(state.hints));
    }
  });
  const ctx = createEditorContext({
    store,
    catalog: input.catalog,
    random: input.random,
    heightmap: terrainFor(input.parcel, input.terrain),
    zones: input.zones,
    ...(input.terraform === undefined ? {} : { terraform: input.terraform }),
  });
  return {
    ctx,
    dispose: unsubscribe,
    sync: opened.sync,
    markSaved: (saved) => {
      draft.saved(saved, store.getState().document);
    },
    expectedUpdatedAt: draft.expected,
    keepMine: ({ updatedAt }) => {
      draft.rebase(updatedAt, store.getState().document);
    },
    useSaved: (current) => {
      store.setState({ document: current.document, history: { past: [], future: [] } });
      forgetLocalDraft(storage.local, designId);
      storage.session.removeItem(historyKey);
      draft.adopt(current.updatedAt);
    },
  };
}
