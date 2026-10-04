import { describe, expect, it } from 'vitest';

import { editorStrings } from './editor/editor-strings';
import { messages } from './messages';
import { viewerStrings, walkStrings } from './viewer-strings';

describe('viewerStrings', () => {
  it('reads the 3D viewer text from the locale file', () => {
    expect(viewerStrings()).toEqual(messages.editor.viewer);
  });

  it('gives the editor the same viewer text', () => {
    expect(editorStrings().viewer).toEqual(viewerStrings());
  });
});

describe('walkStrings', () => {
  it('names the walk controls as the walk section of DESIGN.md does', () => {
    const walk = walkStrings();
    expect([walk.start, walk.exit, walk.next]).toEqual([
      'Walk the park',
      'Back to overview',
      'Next entrance',
    ]);
    expect(walk.near).toBe('Near {label}, {n} m ahead');
  });
});
