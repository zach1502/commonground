import { describe, expect, it } from 'vitest';

import {
  catalogIndex,
  createSeededRandom,
  designDocumentSchema,
  makeRampHeightmap,
  parcelSchema,
  type DesignDocument,
} from '@parkshape/core';
import { historyStorageKey, hintsStorageKey, rotateItem } from '@parkshape/scene/editor';

import { openEditorSession, terrainFor } from './editor-session';
import { markDraftSynced, readLocalDraft, writeLocalDraft } from './local-draft';

const STAMP = '2026-09-26T22:20:00.000Z';
const NEXT_STAMP = '2026-09-26T22:20:00.001Z';

const document: DesignDocument = designDocumentSchema.parse({
  version: 1,
  items: [
    {
      id: 'old-oak',
      catalogId: 'garry-oak',
      position: { x: 20, y: 20 },
      rotationDeg: 0,
      locked: true,
    },
  ],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

const parcel = parcelSchema.parse({
  id: 'p',
  name: 'Park',
  origin: { lat: 49, lon: -123 },
  polygon: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 40 },
    { x: 0, y: 40 },
  ],
});

function open(
  storage = { session: new MemoryStorage(), local: new MemoryStorage() },
  server: DesignDocument = document,
  updatedAt = STAMP,
) {
  const session = openEditorSession({
    designId: 'd1',
    userId: 'u1',
    document: server,
    updatedAt,
    parcel,
    zones: [],
    catalog: catalogIndex,
    random: createSeededRandom(1),
    storage,
  });
  return { ...session, storage };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('terrainFor', () => {
  it('builds the flat parcel grid the API measures on until terrain is stored', () => {
    const heightmap = terrainFor(parcel);
    expect([heightmap.width, heightmap.height, heightmap.resolutionM]).toEqual([60, 40, 1]);
  });

  it('uses the recorded terrain when the project has one, as the server measures on it', () => {
    const recorded = makeRampHeightmap({ width: 60, height: 40, gradeY: 0.3 });
    expect(terrainFor(parcel, recorded)).toBe(recorded);
  });

  it('cuts the ground to a triangular parcel, so the editor draws and places only inside it', () => {
    const triangle = parcelSchema.parse({
      ...parcel,
      polygon: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 0, y: 40 },
      ],
    });
    const recorded = makeRampHeightmap({ width: 60, height: 40, gradeY: 0.3 });
    expect(terrainFor(triangle, recorded).groundOutline).toEqual(triangle.polygon);
    expect(terrainFor(triangle).groundOutline).toEqual(triangle.polygon);
  });
});

describe('openEditorSession on recorded terrain', () => {
  it('gives the editor the recorded ground', () => {
    const recorded = makeRampHeightmap({ width: 60, height: 40, gradeY: 0.3 });
    const session = openEditorSession({
      designId: 'd1',
      userId: 'u1',
      document,
      updatedAt: '2026-09-26T22:20:00.000Z',
      parcel,
      zones: [],
      catalog: catalogIndex,
      random: createSeededRandom(1),
      storage: { session: new MemoryStorage(), local: new MemoryStorage() },
      terrain: recorded,
    });
    expect(session.ctx.baseHeightmap).toBe(recorded);
  });
});

describe('openEditorSession', () => {
  it('starts from the saved design with an empty history and both hints on', () => {
    const { ctx } = open();
    const state = ctx.store.getState();
    expect(state.document).toEqual(document);
    expect(state.history.past).toEqual([]);
    expect(state.hints).toEqual({ camera: 'pending', path: 'pending' });
    expect(ctx.locked.map((footprint) => footprint.id)).toEqual(['old-oak']);
  });

  it('keeps the undo history in sessionStorage so a reload can undo', () => {
    const first = open();
    first.ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    expect(first.storage.session.getItem(historyStorageKey('d1'))).not.toBeNull();
    first.dispose();
    const reloaded = open(first.storage);
    expect(reloaded.ctx.store.getState().document.items[0]?.rotationDeg).toBe(15);
    reloaded.ctx.store.getState().undo();
    expect(reloaded.ctx.store.getState().document).toEqual(document);
  });

  it('remembers dismissed hints per user in localStorage', () => {
    const first = open();
    first.ctx.store.getState().dismissHint('camera');
    expect(first.storage.local.getItem(hintsStorageKey('u1'))).toBe('camera');
    first.dispose();
    expect(open(first.storage).ctx.store.getState().hints).toEqual({
      camera: 'dismissed',
      path: 'pending',
    });
  });

  it('stops writing to storage once disposed', () => {
    const first = open();
    first.dispose();
    first.ctx.store.getState().dismissHint('camera');
    expect(first.storage.local.getItem(hintsStorageKey('u1'))).toBeNull();
  });
});

describe('openEditorSession with a draft on this device', () => {
  const rotated = {
    ...document,
    items: document.items.map((item) => ({ ...item, rotationDeg: 30 })),
  };
  const unsynced = { document: rotated, baseUpdatedAt: STAMP, state: 'unsynced' } as const;

  it('writes every change to localStorage as not yet on the server', () => {
    const { ctx, storage } = open();
    ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    expect(readLocalDraft(storage.local, 'd1')).toMatchObject({
      baseUpdatedAt: STAMP,
      state: 'unsynced',
    });
  });

  it('opens local changes the server has not seen and asks to send them', () => {
    const storage = { session: new MemoryStorage(), local: new MemoryStorage() };
    writeLocalDraft(storage.local, 'd1', unsynced);
    const session = open(storage);
    expect(session.ctx.store.getState().document.items[0]?.rotationDeg).toBe(30);
    expect(session.sync).toBe('push');
    expect(session.expectedUpdatedAt()).toBe(STAMP);
  });

  it('keeps local changes when the server moved on, and sends them from their old stamp', () => {
    const storage = { session: new MemoryStorage(), local: new MemoryStorage() };
    writeLocalDraft(storage.local, 'd1', unsynced);
    const session = open(storage, { ...document, items: [] }, NEXT_STAMP);
    expect(session.ctx.store.getState().document).toEqual(rotated);
    expect(session.sync).toBe('push');
    expect(session.expectedUpdatedAt()).toBe(STAMP);
  });
});

describe('openEditorSession with a session copy in this tab', () => {
  it('reopens this tab copy from its own stamp, and sends it so a newer save asks', () => {
    const storage = { session: new MemoryStorage(), local: new MemoryStorage() };
    const first = open(storage);
    first.ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    const edited = first.ctx.store.getState().document;
    first.dispose();
    markDraftSynced(storage.local, 'd1', { document: edited, updatedAt: STAMP });
    const reopened = open(storage, { ...document, items: [] }, NEXT_STAMP);
    expect(reopened.ctx.store.getState().document).toEqual(edited);
    expect(reopened.expectedUpdatedAt()).toBe(STAMP);
    expect(reopened.sync).toBe('push');
  });

  it('reopens this tab copy with no save when the server copy is the one it last saved', () => {
    const storage = { session: new MemoryStorage(), local: new MemoryStorage() };
    const first = open(storage);
    first.ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    const edited = first.ctx.store.getState().document;
    first.dispose();
    markDraftSynced(storage.local, 'd1', { document: edited, updatedAt: NEXT_STAMP });
    const reopened = open(storage, document, NEXT_STAMP);
    expect(reopened.ctx.store.getState().document).toEqual(edited);
    expect(reopened.sync).toBe('none');
  });

  it('marks the draft synced once the newest document is saved, with the new stamp', () => {
    const { ctx, storage, markSaved, expectedUpdatedAt } = open();
    ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    const sent = ctx.store.getState().document;
    markSaved({ sent, stored: { document: sent, updatedAt: NEXT_STAMP } });
    expect(readLocalDraft(storage.local, 'd1')).toMatchObject({
      state: 'synced',
      baseUpdatedAt: NEXT_STAMP,
    });
    expect(expectedUpdatedAt()).toBe(NEXT_STAMP);
  });
});

describe('openEditorSession for the wizard baseline', () => {
  it('takes the new baseline when an earlier step changed it', () => {
    const storage = { session: new MemoryStorage(), local: new MemoryStorage() };
    const rotated = {
      ...document,
      items: document.items.map((item) => ({ ...item, rotationDeg: 9 })),
    };
    writeLocalDraft(storage.local, 'd1', {
      document: rotated,
      baseUpdatedAt: STAMP,
      state: 'unsynced',
    });
    const changed = { ...document, items: [] };
    const session = openEditorSession({
      designId: 'd1',
      userId: 'u1',
      document: changed,
      updatedAt: NEXT_STAMP,
      whenServerMoved: 'take-server',
      parcel,
      zones: [],
      catalog: catalogIndex,
      random: createSeededRandom(1),
      storage,
    });
    expect(session.ctx.store.getState().document).toEqual(changed);
  });
});

describe('openEditorSession after a conflict', () => {
  const saved = { ...document, items: [] };

  it('keeps this tab document and takes the newer stamp to overwrite with', () => {
    const { ctx, keepMine, expectedUpdatedAt } = open();
    ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    const mine = ctx.store.getState().document;
    keepMine({ updatedAt: NEXT_STAMP });
    expect(ctx.store.getState().document).toBe(mine);
    expect(expectedUpdatedAt()).toBe(NEXT_STAMP);
  });

  it('replaces the document with the saved one, with no undo, and clears the device copy', () => {
    const { ctx, storage, useSaved, expectedUpdatedAt } = open();
    ctx.store.getState().execute(rotateItem('old-oak', 0, 15));
    useSaved({ document: saved, updatedAt: NEXT_STAMP });
    expect(ctx.store.getState().document).toEqual(saved);
    expect(ctx.store.getState().history.past).toEqual([]);
    expect(readLocalDraft(storage.local, 'd1')).toBeNull();
    expect(storage.session.getItem(historyStorageKey('d1'))).toBeNull();
    expect(expectedUpdatedAt()).toBe(NEXT_STAMP);
  });
});
