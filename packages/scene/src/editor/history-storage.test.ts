import { describe, expect, it } from 'vitest';

import { commandStack } from './command-stack.js';
import { moveItem } from './commands.js';
import { historyStorageKey, parseSession, serialiseSession } from './history-storage.js';
import { docOf, treeInput } from './test-fixtures.js';

const doc = docOf({ items: [treeInput('t1', 0, 0)] });

describe('session storage of the undo history', () => {
  it('round-trips the document and the stack', () => {
    const pushed = commandStack.push(
      commandStack.empty(),
      moveItem('t1', { x: 0, y: 0 }, { x: 1, y: 0 }),
      doc,
    );
    const text = serialiseSession({ document: pushed.document, history: pushed.stack });
    expect(parseSession(text)).toEqual({ document: pushed.document, history: pushed.stack });
  });

  it('returns null for missing or broken storage', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('{')).toBeNull();
    expect(
      parseSession(JSON.stringify({ document: doc, history: { past: [{ kind: 'x' }] } })),
    ).toBeNull();
  });

  it('keys storage by design id', () => {
    expect(historyStorageKey('d-1')).toBe('parkshape.history.d-1');
  });
});
