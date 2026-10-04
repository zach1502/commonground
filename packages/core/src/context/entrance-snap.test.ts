import { describe, expect, it } from 'vitest';

import type { PlanePoint } from '../schema/geometry.js';

import { siteContextSchema } from './context-feature.js';
import {
  ENTRANCE_SNAP_INSET_M,
  ENTRANCE_SNAP_RADIUS_M,
  sidewalkLinesOf,
  snapEntrance,
} from './entrance-snap.js';

// A 176 by 86 m parcel, like Jonathan Rogers Park, with its south sidewalk 1.5 m outside.
const parcel: readonly PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 176, y: 0 },
  { x: 176, y: 86 },
  { x: 0, y: 86 },
];
const southSidewalk: readonly PlanePoint[] = [
  { x: -20, y: -1.5 },
  { x: 200, y: -1.5 },
];
const sidewalks = [southSidewalk];

describe('snapEntrance', () => {
  it('snaps a point 4.9 m from a sidewalk to the parcel edge facing it, inset 1.5 m', () => {
    const snap = snapEntrance({
      point: { x: 60, y: 3.4 },
      parcel,
      sidewalks,
      modifier: 'released',
    });
    expect(snap.kind).toBe('snapped');
    expect(snap.point.x).toBeCloseTo(60);
    expect(snap.point.y).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
    expect(snap.kind === 'snapped' ? snap.sidewalk : null).toEqual({ x: 60, y: -1.5 });
  });

  it('leaves a point 5.1 m from every sidewalk where it is', () => {
    const point = { x: 60, y: 3.6 };
    expect(snapEntrance({ point, parcel, sidewalks, modifier: 'released' })).toEqual({
      kind: 'free',
      point,
    });
  });

  it('leaves the point free while the free-place modifier is held', () => {
    const point = { x: 60, y: 1 };
    expect(snapEntrance({ point, parcel, sidewalks, modifier: 'held' })).toEqual({
      kind: 'free',
      point,
    });
  });

  it('changes nothing when no sidewalk is loaded', () => {
    const point = { x: 60, y: 1 };
    expect(snapEntrance({ point, parcel, sidewalks: [], modifier: 'released' }).kind).toBe('free');
  });
});

describe('snapEntrance outside the parcel and at corners', () => {
  it('snaps toward the nearest sidewalk point when the point is outside the parcel', () => {
    const snap = snapEntrance({
      point: { x: 100, y: -4 },
      parcel,
      sidewalks,
      modifier: 'released',
    });
    expect(snap.kind).toBe('snapped');
    expect(snap.point.x).toBeCloseTo(100);
    expect(snap.point.y).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
  });

  it('insets toward the middle at a corner, so the target stays inside the parcel', () => {
    const corner = [
      [
        { x: -5, y: -3 },
        { x: -3, y: -3 },
      ],
    ];
    const snap = snapEntrance({
      point: { x: -1, y: -1 },
      parcel,
      sidewalks: corner,
      modifier: 'released',
    });
    expect(snap.kind).toBe('snapped');
    expect(snap.point.x).toBeGreaterThan(0);
    expect(snap.point.y).toBeGreaterThan(0);
    expect(Math.hypot(snap.point.x, snap.point.y)).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
  });

  it('uses a 5 m reach', () => {
    expect(ENTRANCE_SNAP_RADIUS_M).toBe(5);
  });
});

describe('sidewalkLinesOf', () => {
  it('lists the sidewalk lines and nothing else', () => {
    const source = { name: 'Vancouver Open Data', datasetId: 'sidewalk-condition-rating' };
    const context = siteContextSchema.parse({
      bufferM: 300,
      recordedAt: '2026-10-02T00:00:00.000Z',
      features: [
        {
          id: 'street-1',
          kind: 'street',
          source,
          geometry: {
            type: 'line',
            points: [
              { x: 0, y: -10 },
              { x: 10, y: -10 },
            ],
            widthM: 8,
          },
        },
        {
          id: 'sidewalk-1',
          kind: 'sidewalk',
          source,
          geometry: {
            type: 'line',
            points: [
              { x: 0, y: -1.5 },
              { x: 10, y: -1.5 },
            ],
            widthM: 1.8,
          },
        },
      ],
    });
    expect(sidewalkLinesOf(context)).toEqual([
      [
        { x: 0, y: -1.5 },
        { x: 10, y: -1.5 },
      ],
    ]);
  });
});
