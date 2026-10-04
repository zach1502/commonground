import { describe, expect, it } from 'vitest';

import { moveItem } from '../commands.js';
import { docOf, treeInput } from '../test-fixtures.js';

import { createEditorStore } from './editor-store.js';
import { canRedo, canUndo, selectedItems, selectionToolbarShown, snapMode } from './selectors.js';

const start = docOf({
  items: [treeInput('t1', 0, 0), treeInput('t2', 5, 5), treeInput('old', 9, 9, 'locked')],
});

function storeWithTree() {
  return createEditorStore({ document: start });
}

describe('document and history slices', () => {
  it('runs a command, then undoes and redoes it', () => {
    const store = storeWithTree();
    store.getState().execute(moveItem('t1', { x: 0, y: 0 }, { x: 2, y: 0 }));
    expect(store.getState().document.items[0]?.position.x).toBe(2);
    expect(canUndo(store.getState())).toBe(true);
    store.getState().undo();
    expect(store.getState().document).toEqual(start);
    expect(canRedo(store.getState())).toBe(true);
    store.getState().redo();
    expect(store.getState().document.items[0]?.position.x).toBe(2);
  });

  it('records each history step with a rising serial, and nothing when undo has no step', () => {
    const store = storeWithTree();
    expect(store.getState().change).toBeNull();
    const move = moveItem('t1', { x: 0, y: 0 }, { x: 2, y: 0 });
    store.getState().execute(move);
    expect(store.getState().change).toEqual({ step: 'execute', spec: move, serial: 1 });
    store.getState().undo();
    expect(store.getState().change).toEqual({ step: 'undo', spec: move, serial: 2 });
    store.getState().redo();
    expect(store.getState().change).toEqual({ step: 'redo', spec: move, serial: 3 });
    store.getState().redo();
    expect(store.getState().change?.serial).toBe(3);
  });

  it('starts from a stored history when one is given', () => {
    const store = storeWithTree();
    store.getState().execute(moveItem('t1', { x: 0, y: 0 }, { x: 2, y: 0 }));
    const restored = createEditorStore({
      document: store.getState().document,
      history: store.getState().history,
    });
    restored.getState().undo();
    expect(restored.getState().document).toEqual(start);
  });

  it('drops selected elements that an undo removed', () => {
    const store = storeWithTree();
    store.getState().select([{ kind: 'item', id: 't2' }], 'replace');
    store.getState().replaceDocument(docOf({ items: [treeInput('t1', 0, 0)] }));
    expect(store.getState().selection).toEqual([]);
  });
});

describe('selection slice', () => {
  it('replaces, adds to and toggles the selection', () => {
    const store = storeWithTree();
    const { select } = store.getState();
    select([{ kind: 'item', id: 't1' }], 'replace');
    select([{ kind: 'item', id: 't2' }], 'add');
    expect(selectedItems(store.getState()).map((item) => item.id)).toEqual(['t1', 't2']);
    select([{ kind: 'item', id: 't1' }], 'toggle');
    expect(store.getState().selection).toEqual([{ kind: 'item', id: 't2' }]);
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
  });

  it('refuses locked items', () => {
    const store = storeWithTree();
    store.getState().select([{ kind: 'item', id: 'old' }], 'replace');
    expect(store.getState().selection).toEqual([]);
  });
});

describe('tool slice', () => {
  it('starts in select with snapping on', () => {
    const state = storeWithTree().getState();
    expect(state.tool).toEqual({ kind: 'select' });
    expect(snapMode(state)).toBe('grid');
  });

  it('turns snapping off with the toggle or while Alt is held', () => {
    const store = storeWithTree();
    store.getState().setAlt('held');
    expect(snapMode(store.getState())).toBe('free');
    store.getState().setAlt('released');
    store.getState().setSnap('off');
    expect(snapMode(store.getState())).toBe('free');
  });

  it('switches tools, clears the ghost and keeps paint mode', () => {
    const store = storeWithTree();
    store.getState().setPaint('on');
    store.getState().setGhost({ position: { x: 1, y: 1 }, validity: { valid: true } });
    store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    expect(store.getState().ghost).toBeNull();
    expect(store.getState().paint).toBe('on');
  });
});

describe('selectionToolbarShown', () => {
  it('turns off in the same store update that starts a drawing tool', () => {
    const store = storeWithTree();
    store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
    expect(selectionToolbarShown(store.getState())).toBe(true);
    const seen: boolean[] = [];
    const stop = store.subscribe((state) => seen.push(selectionToolbarShown(state)));
    store.getState().setTool({ kind: 'path', surface: 'gravel', draft: [] });
    store.getState().setTool({ kind: 'select' });
    store.getState().setTool({ kind: 'area', catalogId: 'lawn', draft: null });
    store.getState().setTool({ kind: 'select' });
    store.getState().setTool({ kind: 'terraform' });
    stop();
    expect(seen).toEqual([false, true, false, true, false]);
  });

  it('is off while dragging and with nothing selected', () => {
    const store = storeWithTree();
    expect(selectionToolbarShown(store.getState())).toBe(false);
    store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
    store.getState().setDrag({ x: 1, y: 0 });
    expect(selectionToolbarShown(store.getState())).toBe(false);
  });
});

describe('ui slice', () => {
  it('opens and closes the shortcuts sheet and the items list', () => {
    const store = storeWithTree();
    store.getState().setShortcuts('open');
    store.getState().setItemsList('shown');
    expect(store.getState().shortcuts).toBe('open');
    expect(store.getState().itemsList).toBe('shown');
  });

  it('keeps one notice at a time', () => {
    const store = storeWithTree();
    store.getState().setNotice({ kind: 'locked', id: 'old' });
    expect(store.getState().notice).toEqual({ kind: 'locked', id: 'old' });
    store.getState().setNotice(null);
    expect(store.getState().notice).toBeNull();
  });

  it('dismisses a hint on its own event or by hand', () => {
    const store = storeWithTree();
    store.getState().hintEvent('path-point-added');
    expect(store.getState().hints).toEqual({ camera: 'pending', path: 'dismissed' });
    store.getState().hintEvent('camera-moved');
    expect(store.getState().hints).toEqual({ camera: 'dismissed', path: 'dismissed' });
    store.getState().setHints({ camera: 'pending', path: 'pending' });
    store.getState().dismissHint('camera');
    expect(store.getState().hints).toEqual({ camera: 'dismissed', path: 'pending' });
  });
});

describe('terraform tool slice', () => {
  it('starts as a raise brush and updates its settings', () => {
    const store = storeWithTree();
    expect(store.getState().terraform).toEqual({ mode: 'raise', radiusM: 5, strength: 0.5 });
    store.getState().setTerraform({ mode: 'flatten', radiusM: 8, strength: 0.9 });
    expect(store.getState().terraform).toEqual({ mode: 'flatten', radiusM: 8, strength: 0.9 });
  });
});
