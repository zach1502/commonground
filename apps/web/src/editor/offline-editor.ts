import type { Heightmap } from '@parkshape/core';

import { heightmapOf, terrainOf, type ProjectTerrain } from '../api/terrain';
import type { Design, Project, User } from '../api/web-api';

// One design at a time: the terrain alone is about 80 KB, and localStorage holds about 5 MB.
const SNAPSHOT_KEY = 'parkshape:offline-editor';

/** What the editor route loads; kept on this device so the editor opens with no link. */
export interface EditorData {
  readonly user: User;
  readonly project: Project;
  readonly design: Design;
  readonly baseline: Design | null;
  readonly terrain: Heightmap | null;
}

interface StoredSnapshot extends Omit<EditorData, 'terrain'> {
  readonly terrain: ProjectTerrain | null;
}

/** Keeps the last editor load; a full or blocked store only loses the offline copy. */
export function keepEditorSnapshot(storage: Storage, data: EditorData): void {
  const stored: StoredSnapshot = {
    ...data,
    terrain: data.terrain === null ? null : terrainOf(data.terrain),
  };
  try {
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(stored));
  } catch {
    // The editor still opens online; only the offline copy is missing.
  }
}

/** Drops the kept editor load on sign-out; it holds the last person's design and name. */
export function forgetEditorSnapshot(storage: Storage): void {
  storage.removeItem(SNAPSHOT_KEY);
}

/** The kept editor load for this design, or null when this device has none. */
export function editorSnapshotFor(storage: Storage, designId: string): EditorData | null {
  const text = storage.getItem(SNAPSHOT_KEY);
  if (text === null) return null;
  try {
    const stored = JSON.parse(text) as StoredSnapshot;
    if (stored.design.id !== designId) return null;
    return { ...stored, terrain: stored.terrain === null ? null : heightmapOf(stored.terrain) };
  } catch {
    return null;
  }
}
