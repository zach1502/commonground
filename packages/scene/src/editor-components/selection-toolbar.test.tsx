// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditorStore, type EditorStore } from '../editor/store/editor-store.js';
import type { Tool } from '../editor/store/types.js';
import { docOf, treeInput } from '../editor/test-fixtures.js';

import { SelectionFloatingToolbar } from './FloatingToolbar.js';
import { TEST_STRINGS } from './test-strings.js';

afterEach(cleanup);

function selectedTreeStore(): EditorStore {
  const store = createEditorStore({ document: docOf({ items: [treeInput('t1', 10, 10)] }) });
  store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
  return store;
}

// The canvas re-renders this toolbar's parent a task or more after a store change, so the test
// renders it once and never re-renders the parent: only the toolbar's own subscription may act.
function renderToolbar(store: EditorStore) {
  render(
    <SelectionFloatingToolbar
      store={store}
      strings={TEST_STRINGS}
      onRotateDrag={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

const DRAWING_TOOLS: readonly Tool[] = [
  { kind: 'path', surface: 'gravel', draft: [] },
  { kind: 'area', catalogId: 'lawn', draft: null },
  { kind: 'terraform' },
  { kind: 'place', catalogId: 'bench' },
];

describe('SelectionFloatingToolbar', () => {
  it('shows over a selection with the Select tool', () => {
    renderToolbar(selectedTreeStore());
    expect(screen.getByRole('toolbar', { name: TEST_STRINGS.toolbar.label })).toBeDefined();
  });

  it.each(DRAWING_TOOLS)('hides in the same update that turns on the $kind tool', (tool) => {
    const store = selectedTreeStore();
    renderToolbar(store);
    act(() => {
      store.getState().setTool(tool);
    });
    expect(screen.queryByRole('toolbar', { name: TEST_STRINGS.toolbar.label })).toBeNull();
  });

  it('hides while an item is dragged and with nothing selected', () => {
    const store = selectedTreeStore();
    renderToolbar(store);
    act(() => {
      store.getState().setDrag({ x: 1, y: 0 });
    });
    expect(screen.queryByRole('toolbar')).toBeNull();
    act(() => {
      store.getState().setDrag(null);
      store.getState().clearSelection();
    });
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
