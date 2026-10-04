import { describe, expect, it } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { PALETTE_FALLBACKS } from '../palette/colours.js';

import { draftPathFeature, pathSurfaceTint, pathWidthM } from './path-draft.js';
import { CURVE_SAMPLES_PER_SPAN } from './path-tool.js';

const points = [
  { x: 0, y: 0 },
  { x: 10, y: 4 },
  { x: 20, y: 0 },
];

describe('pathWidthM', () => {
  it('takes the width of each surface from the catalog', () => {
    expect(pathWidthM(catalogIndex, 'asphalt')).toBe(3);
    expect(pathWidthM(catalogIndex, 'gravel')).toBe(2);
    expect(pathWidthM(catalogIndex, 'boardwalk')).toBe(2.4);
  });
});

describe('pathSurfaceTint', () => {
  it('tints boardwalk in soil and asphalt and gravel in the path colour', () => {
    expect(pathSurfaceTint('boardwalk', PALETTE_FALLBACKS)).toBe(PALETTE_FALLBACKS.soil);
    expect(pathSurfaceTint('gravel', PALETTE_FALLBACKS)).toBe(PALETTE_FALLBACKS.pathSurface);
    expect(pathSurfaceTint('asphalt', PALETTE_FALLBACKS)).toBe(PALETTE_FALLBACKS.pathSurface);
  });
});

describe('draftPathFeature', () => {
  it('is the finished ribbon: the surface, its catalog width and the smoothed curve', () => {
    const draft = draftPathFeature({ points, surface: 'boardwalk', catalog: catalogIndex });
    expect(draft).not.toBeNull();
    expect(draft?.surface).toBe('boardwalk');
    expect(draft?.widthM).toBe(2.4);
    expect(draft?.points).toHaveLength(2 * CURVE_SAMPLES_PER_SPAN + 1);
    // Core's north (y) is the scene's z.
    expect(draft?.points[0]).toEqual({ x: 0, z: 0 });
    expect(draft?.points.at(-1)).toEqual({ x: 20, z: 0 });
  });

  it('draws nothing until there are two points', () => {
    expect(draftPathFeature({ points: [], surface: 'gravel', catalog: catalogIndex })).toBeNull();
    expect(
      draftPathFeature({ points: points.slice(0, 1), surface: 'gravel', catalog: catalogIndex }),
    ).toBeNull();
  });
});
