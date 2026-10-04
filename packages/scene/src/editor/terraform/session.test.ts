import { describe, expect, it } from 'vitest';

import { zoneSchema } from '@parkshape/core';

import { contextFor } from '../actions/test-context.js';
import { canUndo } from '../store/selectors.js';
import { docOf } from '../test-fixtures.js';

import { applyStep, beginTerraform } from './session.js';

const raiseSettings = { mode: 'raise' as const, radiusM: 4, strength: 1 };

describe('applyStep', () => {
  it('grades one brush step at the point and commits one undoable command', () => {
    const ctx = contextFor(docOf());
    applyStep({ ctx, settings: raiseSettings }, { x: 30, y: 30 });
    expect(ctx.store.getState().document.gradeDelta.cells.length).toBeGreaterThan(0);
    expect(canUndo(ctx.store.getState())).toBe(true);
    expect(ctx.store.getState().history.past).toHaveLength(1);
    ctx.store.getState().undo();
    expect(ctx.store.getState().document.gradeDelta.cells).toEqual([]);
  });

  it('pushes nothing when every cell under the brush is blocked', () => {
    const ctx = contextFor(docOf(), [
      zoneSchema.parse({
        id: 'z1',
        kind: 'noGrade',
        label: 'No grade',
        polygon: [
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 40 },
          { x: 20, y: 40 },
        ],
      }),
    ]);
    applyStep({ ctx, settings: raiseSettings }, { x: 30, y: 30 });
    expect(canUndo(ctx.store.getState())).toBe(false);
  });
});

describe('beginTerraform', () => {
  it('applies the brush live, then commits one undoable command on end', () => {
    const ctx = contextFor(docOf());
    const session = beginTerraform({ ctx, settings: raiseSettings });
    session.stroke({ x: 30, y: 30 }, 0.1);
    session.stroke({ x: 30, y: 30 }, 0.1);
    expect(ctx.store.getState().document.gradeDelta.cells.length).toBeGreaterThan(0);
    session.end();
    expect(canUndo(ctx.store.getState())).toBe(true);
    const afterCommit = ctx.store.getState().document.gradeDelta.cells.length;
    expect(afterCommit).toBeGreaterThan(0);
    ctx.store.getState().undo();
    expect(ctx.store.getState().document.gradeDelta.cells).toEqual([]);
  });

  it('returns the region to rebuild for a stroke', () => {
    const ctx = contextFor(docOf());
    const session = beginTerraform({ ctx, settings: raiseSettings });
    const region = session.stroke({ x: 30, y: 30 }, 0.1);
    expect(region).not.toBeNull();
    expect(region?.minX).toBeLessThan(region?.maxX ?? 0);
  });

  it('makes no change and pushes nothing when every cell is blocked', () => {
    const ctx = contextFor(docOf(), [
      zoneSchema.parse({
        id: 'z1',
        kind: 'noGrade',
        label: 'No grade',
        polygon: [
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 40 },
          { x: 20, y: 40 },
        ],
      }),
    ]);
    const session = beginTerraform({ ctx, settings: raiseSettings });
    expect(session.stroke({ x: 30, y: 30 }, 0.1)).toBeNull();
    session.end();
    expect(canUndo(ctx.store.getState())).toBe(false);
    expect(ctx.store.getState().document.gradeDelta.cells).toEqual([]);
  });
});
