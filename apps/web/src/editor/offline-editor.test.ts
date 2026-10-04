import { describe, expect, it } from 'vitest';

import type { Design, Project, User } from '../api/web-api';

import { editorSnapshotFor, forgetEditorSnapshot, keepEditorSnapshot } from './offline-editor';

const design = { id: 'design-1' } as Design;
const snapshot = {
  user: { id: 'user-1' } as User,
  project: { id: 'project-1' } as Project,
  design,
  baseline: null,
  terrain: null,
};

describe('forgetEditorSnapshot', () => {
  it('drops the kept editor load, so the next person cannot open it offline', () => {
    const device = window.localStorage;
    keepEditorSnapshot(device, snapshot);
    expect(editorSnapshotFor(device, design.id)?.design.id).toBe(design.id);
    forgetEditorSnapshot(device);
    expect(editorSnapshotFor(device, design.id)).toBeNull();
  });
});
