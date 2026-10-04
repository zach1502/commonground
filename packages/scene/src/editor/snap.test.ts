import { describe, expect, it } from 'vitest';

import { alignToNeighbours, snapModeOf, snapPoint, snapToGrid, SNAP_STEP_M } from './snap.js';

describe('snapToGrid', () => {
  it('rounds each axis to the nearest half metre', () => {
    expect(snapToGrid({ x: 10.24, y: 3.76 }, SNAP_STEP_M)).toEqual({ x: 10, y: 4 });
    expect(snapToGrid({ x: 10.26, y: -0.2 }, SNAP_STEP_M)).toEqual({ x: 10.5, y: 0 });
  });

  it('takes other step sizes', () => {
    expect(snapToGrid({ x: 7.4, y: 1.6 }, 2)).toEqual({ x: 8, y: 2 });
  });
});

describe('snapModeOf', () => {
  it('snaps when the toggle is on and Alt is not held', () => {
    expect(snapModeOf({ toggle: 'on', alt: 'released' })).toBe('grid');
  });

  it('turns snapping off while Alt is held or when the toggle is off', () => {
    expect(snapModeOf({ toggle: 'on', alt: 'held' })).toBe('free');
    expect(snapModeOf({ toggle: 'off', alt: 'released' })).toBe('free');
  });
});

describe('snapPoint', () => {
  it('leaves the point alone in free mode', () => {
    expect(snapPoint({ x: 1.23, y: 4.56 }, 'free')).toEqual({ x: 1.23, y: 4.56 });
  });

  it('snaps in grid mode', () => {
    expect(snapPoint({ x: 1.23, y: 4.56 }, 'grid')).toEqual({ x: 1, y: 4.5 });
  });
});

describe('alignToNeighbours', () => {
  const neighbours = [
    { id: 'a', position: { x: 10, y: 50 } },
    { id: 'b', position: { x: 40, y: 20.1 } },
  ];

  it('lines the point up with a nearby item on each axis and reports the guides', () => {
    const aligned = alignToNeighbours({ x: 10.2, y: 20 }, neighbours, 0.3);
    expect(aligned.point).toEqual({ x: 10, y: 20.1 });
    expect(aligned.guides).toEqual([
      { axis: 'x', value: 10, sourceId: 'a' },
      { axis: 'y', value: 20.1, sourceId: 'b' },
    ]);
  });

  it('leaves the point alone when nothing is within the tolerance', () => {
    const aligned = alignToNeighbours({ x: 25, y: 35 }, neighbours, 0.3);
    expect(aligned).toEqual({ point: { x: 25, y: 35 }, guides: [] });
  });

  it('picks the closest neighbour on an axis', () => {
    const close = [
      { id: 'far', position: { x: 5.25, y: 0 } },
      { id: 'near', position: { x: 5.1, y: 90 } },
    ];
    expect(alignToNeighbours({ x: 5, y: 40 }, close, 0.3).guides[0]?.sourceId).toBe('near');
  });
});
