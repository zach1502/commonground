import { describe, expect, it } from 'vitest';

import {
  gridOf,
  isOnGround,
  makeFlatHeightmap,
  withGroundOutline,
  zoneSchema,
  type Grid,
  type LockedTree,
} from '@parkshape/core';

import { mergeGradeDelta } from './grade-delta.js';
import { clampDelta } from './limits.js';
import type { DeltaPatch } from './types.js';

const SIZE = 20;
const grid: Grid = gridOf(makeFlatHeightmap({ width: SIZE, height: SIZE }));
const MAX = 5;

const base = {
  grid,
  maxDeviationM: MAX,
  noGradeZones: [] as ReturnType<typeof zoneSchema.parse>[],
  lockedTrees: [] as readonly LockedTree[],
  rootZonePerDbhCm: 0.12,
  currentDelta: { cells: [] } as DeltaPatch,
};

const patch = (cells: DeltaPatch['cells']): DeltaPatch => ({ cells });

describe('clampDelta', () => {
  it('holds the accumulated deviation at the limit over repeated strokes', () => {
    let current: DeltaPatch = base.currentDelta;
    for (let stroke = 0; stroke < 10; stroke += 1) {
      const result = clampDelta({
        ...base,
        currentDelta: current,
        patch: patch([{ x: 5, y: 5, deltaM: 2 }]),
      });
      current = mergeGradeDelta(current, result.applied);
    }
    expect(current.cells[0]?.deltaM).toBeCloseTo(MAX, 6);
  });

  it('rejects cells in a no-grade zone and leaves them untouched', () => {
    const zone = zoneSchema.parse({
      id: 'zone-1',
      kind: 'noGrade',
      label: 'Rain garden',
      polygon: [
        { x: 3, y: 3 },
        { x: 7, y: 3 },
        { x: 7, y: 7 },
        { x: 3, y: 7 },
      ],
    });
    const result = clampDelta({
      ...base,
      noGradeZones: [zone],
      patch: patch([{ x: 5, y: 5, deltaM: 2 }]),
    });
    expect(result.applied.cells).toHaveLength(0);
    expect(result.rejected[0]?.reason).toEqual({ kind: 'noGrade', zoneLabel: 'Rain garden' });
  });

  it('rejects cells inside a locked-tree root zone', () => {
    const tree = {
      id: 'tree-1',
      label: 'Oak tree-1',
      position: { x: 5, y: 5 },
      dbhCm: 60,
    } as LockedTree;
    const result = clampDelta({
      ...base,
      lockedTrees: [tree],
      patch: patch([{ x: 5, y: 5, deltaM: 2 }]),
    });
    expect(result.applied.cells).toHaveLength(0);
    expect(result.rejected[0]?.reason).toEqual({ kind: 'rootZone', treeLabel: 'Oak tree-1' });
  });

  it('applies cells away from any blocked zone', () => {
    const result = clampDelta({ ...base, patch: patch([{ x: 12, y: 12, deltaM: 2 }]) });
    expect(result.applied.cells).toEqual([{ x: 12, y: 12, deltaM: 2 }]);
    expect(result.rejected).toHaveLength(0);
  });
});

describe('clampDelta on a triangular parcel', () => {
  const triangle = withGroundOutline(makeFlatHeightmap({ width: SIZE, height: SIZE }), [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 0, y: 20 },
  ]);

  it('grades only the cells inside the triangle', () => {
    const result = clampDelta({
      ...base,
      onGround: (point) => isOnGround(triangle, point),
      patch: patch([
        { x: 3, y: 3, deltaM: 1 },
        { x: 15, y: 15, deltaM: 1 },
      ]),
    });
    expect(result.applied.cells).toEqual([{ x: 3, y: 3, deltaM: 1 }]);
    expect(result.rejected).toEqual([]);
  });
});
