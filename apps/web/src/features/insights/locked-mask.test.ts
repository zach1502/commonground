import { describe, expect, it } from 'vitest';

import { designDocumentSchema, type DesignDocument } from '@parkshape/core';

import type { InsightsHeatmap } from '../../api/staff-api';

import { maskLockedFootprints } from './locked-mask';

const GRID = { width: 10, height: 10, cellM: 1, originLocal: { x: 0, y: 0 } } as const;

const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

function baseline(
  lock: 'locked' | 'free' | 'existing',
  catalogId = 'community-garden',
): DesignDocument {
  return designDocumentSchema.parse({
    version: 1,
    items: [],
    paths: [],
    areas: [
      {
        id: 'garden',
        catalogId,
        polygon: SQUARE,
        locked: lock === 'locked',
        ...(lock === 'existing' ? { existing: true } : {}),
      },
    ],
    gradeDelta: { cells: [] },
    zones: [],
  });
}

function heatmap(category: InsightsHeatmap['category']): InsightsHeatmap {
  return { category, ...GRID, values: Array.from({ length: 100 }, () => 1) };
}

const INSIDE = 1 * GRID.width + 1;
const OUTSIDE = 8 * GRID.width + 8;

describe('maskLockedFootprints', () => {
  it('clears the cells under a locked baseline element on a placement layer', () => {
    const masked = maskLockedFootprints(heatmap('path'), baseline('locked'));
    expect(masked.values[INSIDE]).toBe(0);
    expect(masked.values[OUTSIDE]).toBe(1);
  });

  it('clears desire lines there too, and leaves regrading alone', () => {
    expect(maskLockedFootprints(heatmap('desireLines'), baseline('locked')).values[INSIDE]).toBe(0);
    expect(maskLockedFootprints(heatmap('regrade'), baseline('locked')).values[INSIDE]).toBe(1);
  });

  it('clears the cells under the garden the park has today, even when it is not locked', () => {
    expect(maskLockedFootprints(heatmap('path'), baseline('existing')).values[INSIDE]).toBe(0);
  });

  it('keeps the cells under ground cover the park has today, where designs build', () => {
    expect(maskLockedFootprints(heatmap('path'), baseline('existing', 'lawn')).values[INSIDE]).toBe(
      1,
    );
  });

  it('keeps every cell when the element is free or there is no baseline', () => {
    expect(maskLockedFootprints(heatmap('path'), baseline('free')).values[INSIDE]).toBe(1);
    expect(maskLockedFootprints(heatmap('path'), null).values[INSIDE]).toBe(1);
  });

  it('leaves the grid it was given unchanged', () => {
    const grid = heatmap('garden');
    maskLockedFootprints(grid, baseline('locked'));
    expect(grid.values[INSIDE]).toBe(1);
  });
});
