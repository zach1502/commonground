import { describe, expect, it } from 'vitest';

import { docOf, square, treeInput } from '../test-fixtures.js';

import { beginArea, dragAreaTo, finishArea } from './areas.js';
import {
  gestureAreaTool,
  lockStateOf,
  lockTargetOf,
  setElementLock,
  startZoneTool,
} from './staff.js';
import { contextFor } from './test-context.js';

describe('staff lock toggle', () => {
  it('locks the one selected item and undoes back to unlocked', () => {
    const ctx = contextFor(docOf({ items: [treeInput('t1', 10, 10)] }));
    ctx.store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
    const target = lockTargetOf(ctx.store.getState());
    expect(target).toEqual({ kind: 'item', id: 't1' });
    if (target === null) return;
    expect(setElementLock(ctx, target, 'locked')).toBe('changed');
    expect(lockStateOf(ctx.store.getState(), target)).toBe('locked');
    ctx.store.getState().undo();
    expect(ctx.store.getState().document.items[0]?.locked).toBe(false);
  });

  it('unlocks a locked area', () => {
    const area = { id: 'a1', catalogId: 'lawn', polygon: square(0, 0, 10), locked: true };
    const ctx = contextFor(docOf({ areas: [area] }));
    expect(setElementLock(ctx, { kind: 'area', id: 'a1' }, 'unlocked')).toBe('changed');
    expect(ctx.store.getState().document.areas[0]?.locked).toBe(false);
  });

  it('has no target without exactly one item or area selected', () => {
    const ctx = contextFor(docOf({ items: [treeInput('t1', 10, 10), treeInput('t2', 20, 20)] }));
    expect(lockTargetOf(ctx.store.getState())).toBeNull();
    ctx.store.getState().select(
      [
        { kind: 'item', id: 't1' },
        { kind: 'item', id: 't2' },
      ],
      'replace',
    );
    expect(lockTargetOf(ctx.store.getState())).toBeNull();
  });

  it('does nothing when the state already matches or the element is gone', () => {
    const ctx = contextFor(docOf({ items: [treeInput('t1', 10, 10)] }));
    expect(setElementLock(ctx, { kind: 'item', id: 't1' }, 'unlocked')).toBe('none');
    expect(setElementLock(ctx, { kind: 'item', id: 'gone' }, 'locked')).toBe('none');
    expect(lockStateOf(ctx.store.getState(), { kind: 'item', id: 'gone' })).toBeNull();
  });
});

describe('zone tool', () => {
  it('drags a forbidden zone with the area gesture and stores it in the document', () => {
    const ctx = contextFor(docOf());
    startZoneTool(ctx, { kind: 'forbidden', label: 'Forbidden zone 1' });
    expect(gestureAreaTool(ctx.store.getState().tool)).toBe('zone');
    beginArea(ctx, { x: 2, y: 2 });
    dragAreaTo(ctx, { x: 12, y: 8 });
    expect(finishArea(ctx)).toBe('added');
    const [zone] = ctx.store.getState().document.zones;
    expect(zone).toMatchObject({ kind: 'forbidden', label: 'Forbidden zone 1' });
    expect(zone?.polygon).toEqual([
      { x: 2, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 8 },
      { x: 2, y: 8 },
    ]);
    expect(ctx.store.getState().tool.kind).toBe('select');
    ctx.store.getState().undo();
    expect(ctx.store.getState().document.zones).toEqual([]);
  });

  it('draws a no-grade zone', () => {
    const ctx = contextFor(docOf());
    startZoneTool(ctx, { kind: 'noGrade', label: 'No-grade zone 1' });
    beginArea(ctx, { x: 0, y: 0 });
    dragAreaTo(ctx, { x: 5, y: 5 });
    finishArea(ctx);
    expect(ctx.store.getState().document.zones[0]?.kind).toBe('noGrade');
  });

  it('ignores a zone with no area', () => {
    const ctx = contextFor(docOf());
    startZoneTool(ctx, { kind: 'forbidden', label: 'Forbidden zone 1' });
    beginArea(ctx, { x: 3, y: 3 });
    expect(finishArea(ctx)).toBe('too-small');
    expect(ctx.store.getState().document.zones).toEqual([]);
  });

  it('treats the area tool as an area gesture and other tools as none', () => {
    expect(gestureAreaTool({ kind: 'area', catalogId: 'lawn', draft: null })).toBe('area');
    expect(gestureAreaTool({ kind: 'select' })).toBe('none');
  });
});
