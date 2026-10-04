import { describe, expect, it } from 'vitest';

import {
  forgetLocalDraft,
  forgetLocalDrafts,
  localDraftKey,
  markDraftSynced,
  readLocalDraft,
  reconcileDraft,
  trackDraft,
  writeLocalDraft,
  type LocalDraft,
} from './local-draft';

const SERVER_STAMP = '2026-09-26T22:20:00.000Z';
const NEXT_STAMP = '2026-09-26T22:20:00.001Z';
const SERVER_DOC = { version: 1, items: ['server'] };
const LOCAL_DOC = { version: 1, items: ['server', 'local'] };
const OTHER_DEVICE_DOC = { version: 1, items: ['elsewhere'] };
const SERVER = { document: SERVER_DOC, updatedAt: SERVER_STAMP };

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

const unsynced: LocalDraft = {
  document: LOCAL_DOC,
  baseUpdatedAt: SERVER_STAMP,
  state: 'unsynced',
};

describe('local draft cache', () => {
  it('keeps the draft per design id, and reads back what it wrote', () => {
    const local = storage();
    writeLocalDraft(local, 'd1', unsynced);
    expect(readLocalDraft(local, 'd1')).toEqual(unsynced);
    expect(readLocalDraft(local, 'd2')).toBeNull();
    expect(local.getItem(localDraftKey('d1'))).not.toBeNull();
  });

  it('reads a damaged entry, or one without a server stamp, as no draft', () => {
    const local = storage();
    local.setItem(localDraftKey('d1'), '{not json');
    expect(readLocalDraft(local, 'd1')).toBeNull();
    local.setItem(localDraftKey('d1'), JSON.stringify({ document: 1, state: 'unsynced' }));
    expect(readLocalDraft(local, 'd1')).toBeNull();
  });

  it('records the server copy and its stamp as synced', () => {
    const local = storage();
    markDraftSynced(local, 'd1', SERVER);
    expect(readLocalDraft(local, 'd1')).toEqual({
      document: SERVER_DOC,
      baseUpdatedAt: SERVER_STAMP,
      state: 'synced',
    });
  });

  it('forgets one design and keeps the others', () => {
    const local = storage();
    writeLocalDraft(local, 'd1', unsynced);
    writeLocalDraft(local, 'd2', unsynced);
    forgetLocalDraft(local, 'd1');
    expect(readLocalDraft(local, 'd1')).toBeNull();
    expect(readLocalDraft(local, 'd2')).toEqual(unsynced);
  });

  it('stays quiet when the browser refuses to store more', () => {
    const full = storage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => {
      writeLocalDraft(full, 'd1', unsynced);
    }).not.toThrow();
  });
});

describe('trackDraft', () => {
  it('writes each change as unsynced against the stamp it started from', () => {
    const local = storage();
    const draft = trackDraft(local, 'd1', SERVER_STAMP);
    draft.changed(LOCAL_DOC);
    expect(readLocalDraft(local, 'd1')).toEqual(unsynced);
    expect(draft.expected()).toBe(SERVER_STAMP);
  });

  it('takes the stamp of each save, and marks the draft synced when nothing changed since', () => {
    const local = storage();
    const draft = trackDraft(local, 'd1', SERVER_STAMP);
    draft.changed(LOCAL_DOC);
    draft.saved(
      { sent: LOCAL_DOC, stored: { document: LOCAL_DOC, updatedAt: NEXT_STAMP } },
      LOCAL_DOC,
    );
    expect(readLocalDraft(local, 'd1')).toMatchObject({
      state: 'synced',
      baseUpdatedAt: NEXT_STAMP,
    });
    expect(draft.expected()).toBe(NEXT_STAMP);
  });

  it('keeps a change made during the save unsynced, based on the saved stamp', () => {
    const local = storage();
    const draft = trackDraft(local, 'd1', SERVER_STAMP);
    const newest = { ...LOCAL_DOC, items: ['newest'] };
    draft.saved(
      { sent: LOCAL_DOC, stored: { document: LOCAL_DOC, updatedAt: NEXT_STAMP } },
      newest,
    );
    expect(readLocalDraft(local, 'd1')).toEqual({
      document: newest,
      baseUpdatedAt: NEXT_STAMP,
      state: 'unsynced',
    });
  });

  it('rebases on a newer stamp so the next save overwrites it', () => {
    const local = storage();
    const draft = trackDraft(local, 'd1', SERVER_STAMP);
    draft.changed(LOCAL_DOC);
    draft.rebase(NEXT_STAMP, LOCAL_DOC);
    expect(draft.expected()).toBe(NEXT_STAMP);
    expect(readLocalDraft(local, 'd1')).toMatchObject({ baseUpdatedAt: NEXT_STAMP });
  });
});

describe('reconcileDraft', () => {
  it('takes the server copy and its stamp when there is no local draft', () => {
    expect(reconcileDraft(SERVER, null)).toEqual({
      document: SERVER_DOC,
      source: 'server',
      expectedUpdatedAt: SERVER_STAMP,
    });
  });

  it('pushes local changes from the stamp they started on', () => {
    expect(reconcileDraft(SERVER, unsynced)).toEqual({
      document: LOCAL_DOC,
      source: 'local',
      expectedUpdatedAt: SERVER_STAMP,
    });
  });

  it('keeps local changes when the server moved on, so the save asks instead of dropping them', () => {
    const moved = { document: OTHER_DEVICE_DOC, updatedAt: NEXT_STAMP };
    expect(reconcileDraft(moved, unsynced)).toEqual({
      document: LOCAL_DOC,
      source: 'local',
      expectedUpdatedAt: SERVER_STAMP,
    });
  });

  it('takes the server copy when it moved on and the caller has no save to ask with', () => {
    const moved = { document: OTHER_DEVICE_DOC, updatedAt: NEXT_STAMP };
    expect(reconcileDraft(moved, unsynced, 'take-server')).toEqual({
      document: OTHER_DEVICE_DOC,
      source: 'server',
      expectedUpdatedAt: NEXT_STAMP,
    });
    expect(reconcileDraft(SERVER, unsynced, 'take-server').source).toBe('local');
  });

  it('takes the server copy when the local draft was already saved', () => {
    const synced: LocalDraft = { ...unsynced, state: 'synced' };
    const moved = { document: OTHER_DEVICE_DOC, updatedAt: NEXT_STAMP };
    expect(reconcileDraft(moved, synced)).toEqual({
      document: OTHER_DEVICE_DOC,
      source: 'server',
      expectedUpdatedAt: NEXT_STAMP,
    });
  });
});

describe('forgetLocalDrafts', () => {
  it('removes every design copy on the device and keeps other keys', () => {
    const device = window.localStorage;
    markDraftSynced(device, 'design-1', SERVER);
    writeLocalDraft(device, 'design-2', unsynced);
    device.setItem('parkshape:tutorial:user-1', 'seen');
    forgetLocalDrafts(device);
    expect(readLocalDraft(device, 'design-1')).toBeNull();
    expect(readLocalDraft(device, 'design-2')).toBeNull();
    expect(device.getItem('parkshape:tutorial:user-1')).toBe('seen');
  });
});
