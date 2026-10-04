import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GroundPoint } from '../types.js';

import { buildRibbon } from './ribbon.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const PARCEL = { width: 176, height: 86 };
const ground = heightmapFrom({ ...PARCEL, resolutionM: 1 }, () => 0);
// The ribbon widens by at most twice its half width at a corner.
const MAX_MITER_SCALE = 2;
const NUDGE_M = 1e-12;

const point = fc.record({
  x: fc.double({ min: 0, max: PARCEL.width - 1, noNaN: true }),
  z: fc.double({ min: 0, max: PARCEL.height - 1, noNaN: true }),
});

type Step = 'plain' | 'repeat' | 'reverse';

/** Applies one degenerate step to the polyline: repeat the last point, or turn straight back. */
function applyStep(points: GroundPoint[], next: GroundPoint, step: Step): GroundPoint[] {
  const last = points.at(-1);
  const before = points.at(-2);
  if (step === 'repeat' && last !== undefined) return [...points, last, next];
  if (step === 'reverse' && before !== undefined) {
    return [...points, { x: before.x + NUDGE_M, z: before.z - NUDGE_M }, next];
  }
  return [...points, next];
}

const polyline = fc
  .record({
    start: point,
    steps: fc.array(fc.tuple(point, fc.constantFrom<Step>('plain', 'repeat', 'reverse')), {
      minLength: 1,
      maxLength: 12,
    }),
    closed: fc.boolean(),
  })
  .map(({ start, steps, closed }) => {
    const open = steps.reduce<GroundPoint[]>(
      (acc, [next, step]) => applyStep(acc, next, step),
      [start],
    );
    return closed ? [...open, start] : open;
  });

describe('buildRibbon property', () => {
  it('keeps every vertex finite and within the parcel plus the widened half width', () => {
    fc.assert(
      fc.property(polyline, fc.double({ min: 0.5, max: 4, noNaN: true }), (points, widthM) => {
        const { positions } = buildRibbon(ground, points, { widthM });
        const reach = MAX_MITER_SCALE * (widthM / 2) + 1e-3;
        for (let index = 0; index < positions.length; index += 3) {
          const x = positions[index] ?? Number.NaN;
          const z = positions[index + 2] ?? Number.NaN;
          expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-reach);
          expect(x).toBeLessThanOrEqual(PARCEL.width - 1 + reach);
          expect(z).toBeGreaterThanOrEqual(-reach);
          expect(z).toBeLessThanOrEqual(PARCEL.height - 1 + reach);
        }
      }),
      { seed: 20260926, numRuns: 500 },
    );
  });
});
