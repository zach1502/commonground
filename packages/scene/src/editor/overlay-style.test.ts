import { describe, expect, it } from 'vitest';

import { PALETTE_FALLBACKS } from '../palette/colours.js';

import {
  BRUSH_HALO_PX,
  BRUSH_RING_PX,
  ghostColour,
  ghostMarkerRadiusM,
  GHOST_MIN_PX,
  metresPerPixel,
  GHOST_OPACITY,
  REASON_OFFSET_PX,
  selectionRingRadiusM,
  SELECTION_OUTLINE_PX,
} from './overlay-style.js';

describe('the placing ghost', () => {
  it('is tinted success when the spot is valid and danger when it is not', () => {
    expect(ghostColour({ valid: true }, PALETTE_FALLBACKS)).toBe(PALETTE_FALLBACKS.success);
    expect(ghostColour({ valid: false }, PALETTE_FALLBACKS)).toBe(PALETTE_FALLBACKS.danger);
    expect(GHOST_OPACITY).toBe(0.5);
  });

  it('puts the reason label 12 px from the cursor', () => {
    expect(REASON_OFFSET_PX).toBe(12);
  });
});

describe('the selection', () => {
  it('draws a 2 px outline in the BC focus colour and a ring just outside the footprint', () => {
    expect(SELECTION_OUTLINE_PX).toBe(2);
    expect(PALETTE_FALLBACKS.focus).toBe('#2e5dd7');
    expect(selectionRingRadiusM({ widthM: 1.8, depthM: 0.6 })).toBeGreaterThan(
      Math.hypot(1.8, 0.6) / 2,
    );
  });
});

describe('the brush ring', () => {
  it('draws the brush ring 2 px wide on a wider light halo', () => {
    expect(BRUSH_RING_PX).toBe(2);
    expect(BRUSH_HALO_PX).toBeGreaterThan(BRUSH_RING_PX);
  });
});

describe('the ghost marker', () => {
  const bench = { widthM: 1.8, depthM: 0.6 };
  const lens = { fovDeg: 38, viewportHeightPx: 900 };
  const diameterPx = (distanceM: number) => {
    const view = { ...lens, distanceM };
    return (ghostMarkerRadiusM(bench, view) * 2) / metresPerPixel(view);
  };

  it('works out metres per pixel from the camera distance, field of view and canvas height', () => {
    const view = { distanceM: 100, ...lens };
    expect(metresPerPixel(view)).toBeCloseTo((2 * 100 * Math.tan((19 * Math.PI) / 180)) / 900, 9);
  });

  it('never draws smaller than 24 px across, however far the camera is', () => {
    expect(GHOST_MIN_PX).toBe(24);
    for (const distanceM of [5, 40, 150, 400, 1200]) {
      expect(diameterPx(distanceM)).toBeGreaterThanOrEqual(GHOST_MIN_PX - 1e-6);
    }
    expect(diameterPx(1200)).toBeCloseTo(GHOST_MIN_PX, 6);
  });

  it('hugs the footprint when the camera is close, so it stays true to scale', () => {
    const near = ghostMarkerRadiusM(bench, { ...lens, distanceM: 10 });
    expect(near).toBeGreaterThan(Math.hypot(1.8, 0.6) / 2);
    expect(near).toBeLessThan(Math.hypot(1.8, 0.6) / 2 + 1);
  });
});
