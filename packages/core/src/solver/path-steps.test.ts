import { describe, expect, it } from 'vitest';

import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeRampHeightmap } from '../metrics/heightmap.js';

import { stepBit } from './astar.js';
import { slopeSteps } from './path-steps.js';
import { buildSite, indexOf } from './site.js';

const limits = { maxRunning: 0.05, maxCross: 0.02 };

function stepsOn(gradeX: number, gradeY: number) {
  const heightmap = makeRampHeightmap({ width: 12, height: 12, gradeX, gradeY });
  const site = buildSite(rectangleParcel(12, 12), heightmap);
  return slopeSteps(site, { widthM: 2, limits })[indexOf(site.grid, 6, 6)] ?? 0;
}

const allows = (mask: number, di: number, dj: number) => (mask & stepBit(di, dj)) !== 0;

describe('slopeSteps', () => {
  it('allows every step on flat ground', () => {
    const mask = stepsOn(0, 0);
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
    ].forEach(([di = 0, dj = 0]) => {
      expect(allows(mask, di, dj)).toBe(true);
    });
  });

  it('allows steps along the fall line of a 3% slope but not across it', () => {
    const mask = stepsOn(0, 0.03);
    expect(allows(mask, 0, 1)).toBe(true);
    expect(allows(mask, 0, -1)).toBe(true);
    // Across the slope the cross slope is 3%; a diagonal still has 2.1% across.
    expect(allows(mask, 1, 0)).toBe(false);
    expect(allows(mask, 1, 1)).toBe(false);
  });

  it('allows no step up a 6% slope', () => {
    const mask = stepsOn(0.06, 0);
    expect(allows(mask, 1, 0)).toBe(false);
    expect(allows(mask, -1, 0)).toBe(false);
    expect(allows(mask, 0, 1)).toBe(false);
    expect(allows(mask, 1, 1)).toBe(false);
  });

  it('allows a 4% climb along the fall line', () => {
    expect(allows(stepsOn(0.04, 0), 1, 0)).toBe(true);
  });
});
