import { describe, expect, it } from 'vitest';

import {
  designDocumentSchema,
  itemIdSchema,
  zoneSchema,
  type MetricsReport,
  type PathSlopes,
} from '@parkshape/core';

import { frameTargetForConstraint, type FrameContext } from './frame-target.js';

const document = designDocumentSchema.parse({
  version: 1,
  items: [
    {
      id: 'bench-1',
      catalogId: 'park-bench',
      position: { x: 5, y: 5 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: 'path-1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ],
  areas: [
    {
      id: 'garden-1',
      catalogId: 'raised-bed-kit',
      polygon: [
        { x: 2, y: 2 },
        { x: 6, y: 2 },
        { x: 6, y: 8 },
        { x: 2, y: 8 },
      ],
      locked: false,
    },
  ],
  gradeDelta: { cells: [] },
  zones: [],
});

const zones = [
  zoneSchema.parse({
    id: 'zone-1',
    kind: 'forbidden',
    polygon: [
      { x: 20, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
    ],
    label: 'Root protection',
  }),
];

function reportWith(pathSlopes: readonly PathSlopes[]): MetricsReport {
  return { details: { pathSlopes } } as unknown as MetricsReport;
}

const base: FrameContext = { document, zones, report: reportWith([]) };

describe('frameTargetForConstraint', () => {
  it('frames the first area for a required-features failure', () => {
    expect(frameTargetForConstraint('requiredFeatures', base)).toEqual({
      kind: 'area',
      id: 'garden-1',
      point: { x: 4, y: 5 },
    });
  });

  it('frames the forbidden zone for a zone failure', () => {
    expect(frameTargetForConstraint('forbiddenZones', base)).toEqual({
      kind: 'zone',
      id: 'zone-1',
      point: { x: 25, y: 25 },
    });
  });

  it('frames the steep path from the report slope details', () => {
    const report = reportWith([
      {
        pathId: itemIdSchema.parse('path-1'),
        pathNumber: 1,
        existing: false,
        maxRunning: 0.1,
        maxCross: 0,
        runningSegments: [3],
        crossSegments: [],
      },
    ]);
    expect(frameTargetForConstraint('slopes', { document, zones, report })).toEqual({
      kind: 'path',
      id: 'path-1',
      point: { x: 5, y: 0 },
    });
  });

  it('frames the first item for a counts failure', () => {
    expect(frameTargetForConstraint('counts', base)).toEqual({
      kind: 'item',
      id: 'bench-1',
      point: { x: 5, y: 5 },
    });
  });

  it('has no single place for a budget failure', () => {
    expect(frameTargetForConstraint('budget', base)).toBeNull();
  });

  it('returns null when no path is over the limit', () => {
    expect(frameTargetForConstraint('slopes', base)).toBeNull();
  });
});

describe('frameTargetForConstraint with existing paths', () => {
  it('skips a steep existing path, which is not a slope problem', () => {
    const steep = {
      pathId: itemIdSchema.parse('path-1'),
      pathNumber: 1,
      existing: true,
      maxRunning: 0.1,
      maxCross: 0,
      runningSegments: [3],
      crossSegments: [],
    };
    const report = reportWith([steep]);
    expect(frameTargetForConstraint('slopes', { document, zones, report })).toBeNull();
  });
});
