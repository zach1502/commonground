import { describe, expect, it } from 'vitest';

import { COMMENT_CHIP_MAX_DISTANCE_M } from '@parkshape/core';

import { docOf, square } from '../editor/test-fixtures.js';

import { commentChipSpots, visibleChipIds, type ChipView, type CommentChipSpot } from './chips.js';

const benchAt = (id: string, x: number, y: number) => ({
  id,
  catalogId: 'bench',
  position: { x, y },
  rotationDeg: 0,
  locked: false,
});

const design = docOf({
  items: [benchAt('bench-1', 10, 10), benchAt('bench-2', 20, 10)],
  paths: [
    {
      id: 'path-1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 40 },
        { x: 30, y: 40 },
      ],
    },
  ],
  areas: [{ id: 'lawn-1', catalogId: 'lawn', polygon: square(60, 60, 10), locked: false }],
});

/** Looking north from the south edge, aimed at the origin. */
const fromSouth: ChipView = {
  focus: { x: 0, y: 0 },
  camera: { x: 0, y: 30, z: -50 },
  forward: { x: 0, y: -0.5, z: 1 },
};

function spot(elementId: string, x: number, count: number): CommentChipSpot {
  return { elementId, point: { x, y: 0 }, elevationM: 0, count };
}

describe('commentChipSpots', () => {
  it('puts one chip on each element with comments, at its anchor', () => {
    const counts = new Map([
      ['bench-1', 2],
      ['path-1', 1],
      ['lawn-1', 3],
    ]);
    expect(commentChipSpots(design, counts, () => 4)).toEqual([
      { elementId: 'bench-1', point: { x: 10, y: 10 }, elevationM: 4, count: 2 },
      { elementId: 'path-1', point: { x: 15, y: 40 }, elevationM: 4, count: 1 },
      { elementId: 'lawn-1', point: { x: 65, y: 65 }, elevationM: 4, count: 3 },
    ]);
  });

  it('leaves out elements with no comments and ids the design no longer has', () => {
    const counts = new Map([
      ['bench-2', 0],
      ['gone', 4],
    ]);
    expect(commentChipSpots(design, counts, () => 0)).toEqual([]);
  });
});

describe('visibleChipIds', () => {
  it('shows chips in front of the camera within the distance cap', () => {
    const spots = [spot('near', 10, 1), spot('far', COMMENT_CHIP_MAX_DISTANCE_M + 1, 1)];
    expect(visibleChipIds(spots, fromSouth)).toEqual(['near']);
  });

  it('hides chips behind the camera', () => {
    const behind = { ...spot('behind', 0, 1), point: { x: 0, y: -75 } };
    const view = { ...fromSouth, focus: { x: 0, y: -40 } };
    expect(visibleChipIds([behind, spot('ahead', 5, 1)], view)).toEqual(['ahead']);
  });

  it('keeps the 10 busiest when more than 20 would show', () => {
    const crowd = Array.from({ length: 21 }, (_, index) =>
      spot(`e${String(index)}`, index, index + 1),
    );
    const shown = visibleChipIds(crowd, fromSouth);
    expect(shown).toHaveLength(10);
    expect(shown).toEqual(crowd.slice(11).map((entry) => entry.elementId));
  });
});
