import { describe, expect, it } from 'vitest';

import { shouldIgnoreKey } from '../keyboard.js';
import { docOf, square, treeInput } from '../test-fixtures.js';

import {
  clickAt,
  contextMenuAt,
  doubleClickAt,
  handleDown,
  NO_GESTURE,
  pointerDown,
  pointerMove,
  pointerUp,
  type PointerInput,
} from './gestures.js';
import { placeItemAt, startPlacing } from './placing.js';
import { pointerSelect, rotateSelectionByDrag } from './selecting.js';
import { contextFor } from './test-context.js';

const doc = docOf({
  items: [treeInput('t1', 10, 10), treeInput('old', 30, 30, 'locked')],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: square(40, 0, 10), locked: false }],
});
const at = (x: number, y: number, shift: 'held' | 'released' = 'released'): PointerInput => ({
  point: { x, y },
  shift,
});

describe('pointer gestures in the select tool', () => {
  it('drags a selected item and commits the move on release', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    const gesture = pointerDown(ctx, at(10, 10));
    expect(gesture.kind).toBe('move');
    const moved = pointerMove(ctx, gesture, at(14, 10));
    pointerUp(ctx, moved, at(14, 10));
    expect(ctx.store.getState().document.items[0]?.position).toEqual({ x: 14, y: 10 });
  });

  it('blocks a drag that starts on a locked item, and shows its badge', () => {
    const ctx = contextFor(doc);
    const gesture = pointerDown(ctx, at(30, 30));
    expect(gesture.kind).toBe('blocked');
    pointerUp(ctx, pointerMove(ctx, gesture, at(35, 30)), at(35, 30));
    expect(ctx.store.getState().document).toEqual(doc);
    expect(ctx.store.getState().notice).toEqual({ kind: 'locked', id: 'old' });
  });

  it('lets an ordinary drag on the ground orbit the camera', () => {
    const ctx = contextFor(doc);
    expect(pointerDown(ctx, at(20, 20)).kind).toBe('none');
  });

  it('draws a marquee with Shift on empty ground', () => {
    const ctx = contextFor(doc);
    const gesture = pointerDown(ctx, at(0, 0, 'held'));
    const moved = pointerMove(ctx, gesture, at(20, 20, 'held'));
    expect(moved).toEqual({ kind: 'marquee', from: { x: 0, y: 0 }, to: { x: 20, y: 20 } });
    pointerUp(ctx, moved, at(20, 20, 'held'));
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: 't1' }]);
  });

  it('selects on click and toggles with Shift', () => {
    const ctx = contextFor(doc);
    clickAt(ctx, at(10, 10));
    expect(ctx.store.getState().selection).toHaveLength(1);
    clickAt(ctx, at(10, 10, 'held'));
    expect(ctx.store.getState().selection).toHaveLength(0);
  });

  it('marks the unlocked item under the pointer as hovered, and clears off it', () => {
    const ctx = contextFor(doc);
    pointerMove(ctx, { kind: 'none' }, at(10, 10));
    expect(ctx.store.getState().hovered).toBe('t1');
    pointerMove(ctx, { kind: 'none' }, at(55, 55));
    expect(ctx.store.getState().hovered).toBeNull();
  });

  it('does not hover a locked item', () => {
    const ctx = contextFor(doc);
    pointerMove(ctx, { kind: 'none' }, at(30, 30));
    expect(ctx.store.getState().hovered).toBeNull();
  });
});

describe('pointer gestures in the other tools', () => {
  it('places on click and leaves paint mode on right-click', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setPaint('on');
    startPlacing(ctx, 'bench');
    pointerMove(ctx, { kind: 'none' }, at(20, 20));
    expect(ctx.store.getState().ghost?.validity).toEqual({ valid: true });
    clickAt(ctx, at(20, 20));
    expect(ctx.store.getState().document.items).toHaveLength(3);
    contextMenuAt(ctx);
    expect(ctx.store.getState().tool).toEqual({ kind: 'select' });
  });

  it('adds path points on click, previews the next one, and finishes on double-click', () => {
    const ctx = contextFor(doc);
    startPlacing(ctx, 'path-gravel');
    clickAt(ctx, at(0, 0));
    pointerMove(ctx, { kind: 'none' }, at(5, 5));
    expect(ctx.store.getState().ghost?.position).toEqual({ x: 5, y: 5 });
    clickAt(ctx, at(5, 0));
    clickAt(ctx, at(5, 5));
    clickAt(ctx, at(5, 5));
    doubleClickAt(ctx);
    expect(ctx.store.getState().document.paths[0]?.points).toHaveLength(3);
  });

  it('drags out an area', () => {
    const ctx = contextFor(doc);
    startPlacing(ctx, 'community-garden');
    const gesture = pointerDown(ctx, at(0, 20));
    expect(gesture.kind).toBe('area');
    pointerUp(ctx, pointerMove(ctx, gesture, at(12, 32)), at(12, 32));
    expect(ctx.store.getState().document.areas).toHaveLength(2);
  });
});

describe('pointer gestures for area corners and handles', () => {
  it('adds an area from two corner clicks with a preview between them', () => {
    const ctx = contextFor(doc);
    startPlacing(ctx, 'community-garden');
    const first = pointerDown(ctx, at(0, 20));
    pointerUp(ctx, first, at(0, 20));
    expect(ctx.store.getState().document.areas).toHaveLength(1);
    pointerMove(ctx, { kind: 'none' }, at(12, 32));
    const second = pointerDown(ctx, at(12, 32));
    pointerUp(ctx, second, at(12, 32));
    expect(ctx.store.getState().document.areas).toHaveLength(2);
  });

  it('adds a corner on click after Add corner', () => {
    const ctx = contextFor(doc);
    ctx.store.getState().setTool({ kind: 'add-corner', areaId: 'a1' });
    clickAt(ctx, at(45, -1));
    expect(ctx.store.getState().document.areas[0]?.polygon).toHaveLength(5);
  });

  it('drags a path vertex and an area corner from their handles', () => {
    const ctx = contextFor(doc);
    const corner = handleDown(ctx, { kind: 'corner', id: 'a1', index: 2 });
    const moved = pointerMove(ctx, corner, at(52, 11));
    expect(moved).toMatchObject({ kind: 'corner', point: { x: 52, y: 11 } });
    pointerUp(ctx, moved, at(52, 11));
    expect(ctx.store.getState().document.areas[0]?.polygon[2]).toEqual({ x: 52, y: 11 });
    const vertex = handleDown(ctx, { kind: 'vertex', id: 'missing', index: 0 });
    pointerUp(ctx, pointerMove(ctx, vertex, at(1, 1)), at(1, 1));
    expect(ctx.store.getState().history.past).toHaveLength(1);
  });
});

describe('placeItemAt', () => {
  it('places from typed coordinates without the canvas', () => {
    const ctx = contextFor(doc);
    expect(placeItemAt(ctx, 'bench', { x: 20, y: 5 })).toEqual({ valid: true });
    expect(ctx.store.getState().document.items[2]).toMatchObject({
      catalogId: 'bench',
      position: { x: 20, y: 5 },
    });
    expect(placeItemAt(ctx, 'bench', { x: 30, y: 30 })).toMatchObject({ valid: false });
  });
});

describe('rotateSelectionByDrag', () => {
  it('turns one step per 20 px and one step for a plain click', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    rotateSelectionByDrag(ctx, 41);
    expect(ctx.store.getState().document.items[0]?.rotationDeg).toBe(30);
    rotateSelectionByDrag(ctx, 0);
    expect(ctx.store.getState().document.items[0]?.rotationDeg).toBe(45);
  });
});

describe('shouldIgnoreKey', () => {
  it('leaves typing in fields alone', () => {
    expect(shouldIgnoreKey({ tagName: 'INPUT' }, 'Delete')).toBe(true);
    expect(shouldIgnoreKey({ tagName: 'SELECT' }, 'z')).toBe(true);
    expect(shouldIgnoreKey({ tagName: 'CANVAS' }, 'Delete')).toBe(false);
    expect(shouldIgnoreKey(null, 'Delete')).toBe(false);
  });

  it('lets Enter and Space press a focused button', () => {
    expect(shouldIgnoreKey({ tagName: 'BUTTON' }, 'Enter')).toBe(true);
    expect(shouldIgnoreKey({ tagName: 'BUTTON' }, ' ')).toBe(true);
    expect(shouldIgnoreKey({ tagName: 'BUTTON' }, 'Delete')).toBe(false);
  });
});

describe('a pick right after placement (J5, J17)', () => {
  const onLawn = docOf({
    areas: [{ id: 'lawn1', catalogId: 'lawn', polygon: square(0, 0, 60), locked: false }],
  });

  it('hits the bench just placed on the lawn, not the lawn, with no frame in between', () => {
    const ctx = contextFor(onLawn);
    startPlacing(ctx, 'bench');
    clickAt(ctx, at(20, 20));
    const bench = ctx.store.getState().document.items.at(-1);
    ctx.store.getState().clearSelection();
    clickAt(ctx, at(20, 20));
    expect(bench?.catalogId).toBe('bench');
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: bench?.id }]);
  });

  it('hovers the bench just placed, so the pointer cursor shows at once', () => {
    const ctx = contextFor(onLawn);
    startPlacing(ctx, 'bench');
    clickAt(ctx, at(20, 20));
    const bench = ctx.store.getState().document.items.at(-1);
    pointerMove(ctx, NO_GESTURE, at(20, 20));
    expect(ctx.store.getState().hovered).toBe(bench?.id);
  });
});

describe('a pointer aimed at an item model above the ground (owner bug 3)', () => {
  // The ground point is where the ray reached the terrain, behind the tree crown it passed.
  const behind = (aimed: string, shift: 'held' | 'released' = 'released'): PointerInput => ({
    point: { x: 10, y: 24 },
    shift,
    aimed,
  });

  it('selects the aimed item on click, though the ground point behind it is empty', () => {
    const ctx = contextFor(doc);
    clickAt(ctx, behind('t1'));
    expect(ctx.store.getState().selection).toEqual([{ kind: 'item', id: 't1' }]);
  });

  it('hovers the aimed item', () => {
    const ctx = contextFor(doc);
    pointerMove(ctx, NO_GESTURE, behind('t1'));
    expect(ctx.store.getState().hovered).toBe('t1');
  });

  it('drags the aimed item once selected, by the ground distance the pointer moves', () => {
    const ctx = contextFor(doc);
    clickAt(ctx, behind('t1'));
    const gesture = pointerDown(ctx, behind('t1'));
    expect(gesture.kind).toBe('move');
    pointerUp(ctx, pointerMove(ctx, gesture, at(14, 24)), at(14, 24));
    expect(ctx.store.getState().document.items[0]?.position).toEqual({ x: 14, y: 10 });
  });

  it('blocks an aimed locked item and shows its badge', () => {
    const ctx = contextFor(doc);
    expect(pointerDown(ctx, behind('old')).kind).toBe('blocked');
    expect(ctx.store.getState().notice).toEqual({ kind: 'locked', id: 'old' });
  });
});
