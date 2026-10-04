import { describe, expect, it } from 'vitest';

import type { ParkDocument } from '../types.js';

import { walkStarts } from './walk-starts.js';

const square = [
  { x: 0, z: 0 },
  { x: 60, z: 0 },
  { x: 60, z: 60 },
  { x: 0, z: 60 },
];
const empty: ParkDocument = { items: [], paths: [], areas: [], water: [] };
const pathFrom = (id: string, points: { x: number; z: number }[]) => ({ id, points, widthM: 2 });

describe('walkStarts', () => {
  it('starts at the path ends near the parcel edge, nearest the current view first', () => {
    const document: ParkDocument = {
      ...empty,
      paths: [
        pathFrom('west', [
          { x: 1, z: 30 },
          { x: 30, z: 30 },
        ]),
        pathFrom('north', [
          { x: 30, z: 31 },
          { x: 30, z: 59 },
        ]),
      ],
    };
    const starts = walkStarts({ document, parcel: square, near: { x: 30, z: 55 } });
    expect(starts.map((start) => start.kind)).toEqual(['entrance', 'entrance']);
    expect(starts[0]?.position).toEqual({ x: 30, z: 59 });
    expect(starts[1]?.position).toEqual({ x: 1, z: 30 });
  });

  it('faces each start toward the middle of the parcel', () => {
    const document: ParkDocument = {
      ...empty,
      paths: [
        pathFrom('west', [
          { x: 1, z: 30 },
          { x: 20, z: 30 },
        ]),
      ],
    };
    const [start] = walkStarts({ document, parcel: square, near: { x: 0, z: 30 } });
    // Facing +x, the parcel's middle, is a heading of 90 degrees.
    expect(start?.headingRad).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('walkStarts without entrances', () => {
  it('counts a path that starts and ends at one point as one entrance', () => {
    const loop = [
      { x: 2, z: 30 },
      { x: 30, z: 30 },
      { x: 2, z: 30 },
    ];
    const document: ParkDocument = { ...empty, paths: [pathFrom('loop', loop)] };
    const entrances = walkStarts({ document, parcel: square, near: { x: 30, z: 30 } }).filter(
      (start) => start.kind === 'entrance',
    );
    expect(entrances).toHaveLength(1);
  });

  it('adds the edge point nearest the view, just inside, when there is no second entrance', () => {
    const starts = walkStarts({ document: empty, parcel: square, near: { x: 45, z: 2 } });
    expect(starts).toHaveLength(1);
    expect(starts[0]?.kind).toBe('edge');
    expect(starts[0]?.position.x).toBeCloseTo(45, 6);
    expect(starts[0]?.position.z).toBeGreaterThan(0);
    expect(starts[0]?.position.z).toBeLessThan(2);
  });

  it('skips path ends far from the edge', () => {
    const document: ParkDocument = {
      ...empty,
      paths: [
        pathFrom('middle', [
          { x: 20, z: 20 },
          { x: 40, z: 40 },
        ]),
      ],
    };
    const starts = walkStarts({ document, parcel: square, near: { x: 30, z: 30 } });
    expect(starts.every((start) => start.kind === 'edge')).toBe(true);
  });
});
