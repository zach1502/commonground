import { describe, expect, it } from 'vitest';

import {
  catalogIndex,
  gridOf,
  isOnGround,
  makeFlatHeightmap,
  makeRampHeightmap,
  slopeAt,
  withGroundOutline,
  zoneSchema,
} from '@parkshape/core';

import { lockedFootprints, validatePlacement, type SlopeSampler } from './placement-validity.js';
import { docOf, square, treeInput } from './test-fixtures.js';

const flat = makeFlatHeightmap({ width: 60, height: 60 });
const grid = gridOf(flat);
const flatSlope = () => 0;
const zone = zoneSchema.parse({
  id: 'z1',
  kind: 'forbidden',
  polygon: square(40, 40, 10),
  label: 'Utility corridor',
});
const doc = docOf({ items: [treeInput('old-oak', 10, 10, 'locked'), treeInput('t2', 30, 30)] });
const locked = lockedFootprints({ document: doc, catalog: catalogIndex, grid });

function check(
  candidate: { catalogId: string; x: number; y: number },
  slope: SlopeSampler = flatSlope,
) {
  return validatePlacement({
    document: doc,
    catalog: catalogIndex,
    candidate: {
      catalogId: candidate.catalogId,
      position: { x: candidate.x, y: candidate.y },
      rotationDeg: 0,
    },
    zones: [zone],
    lockedFootprints: locked,
    slopeSampler: slope,
    grid,
  });
}

describe('lockedFootprints', () => {
  it('keeps only the locked elements', () => {
    expect(locked.map((footprint) => footprint.id)).toEqual(['old-oak']);
  });
});

describe('validatePlacement', () => {
  it('accepts open, level ground', () => {
    expect(check({ catalogId: 'bench', x: 20, y: 20 })).toEqual({ valid: true });
  });

  it('accepts a spot next to an unlocked item', () => {
    expect(check({ catalogId: 'bench', x: 30, y: 30 })).toEqual({ valid: true });
  });

  it('blocks a spot on a locked footprint and names it', () => {
    expect(check({ catalogId: 'bench', x: 10.4, y: 10 })).toEqual({
      valid: false,
      reason: 'locked footprint',
      label: 'bigleaf-maple',
    });
  });

  it('blocks a spot in a forbidden zone from the project or the document', () => {
    expect(check({ catalogId: 'bench', x: 45, y: 45 })).toEqual({
      valid: false,
      reason: 'forbidden zone',
      label: 'Utility corridor',
    });
    const own = docOf({
      zones: [{ id: 'z2', kind: 'forbidden', polygon: square(0, 40, 5), label: 'Pond edge' }],
    });
    const result = validatePlacement({
      document: own,
      catalog: catalogIndex,
      candidate: { catalogId: 'bench', position: { x: 2, y: 42 }, rotationDeg: 0 },
      zones: [],
      lockedFootprints: [],
      slopeSampler: flatSlope,
      grid,
    });
    expect(result).toMatchObject({ reason: 'forbidden zone', label: 'Pond edge' });
  });

  it('ignores no-grade zones, which only block terraforming', () => {
    const noGrade = { ...zone, kind: 'noGrade' as const };
    const result = validatePlacement({
      document: doc,
      catalog: catalogIndex,
      candidate: { catalogId: 'bench', position: { x: 45, y: 45 }, rotationDeg: 0 },
      zones: [noGrade],
      lockedFootprints: locked,
      slopeSampler: flatSlope,
      grid,
    });
    expect(result).toEqual({ valid: true });
  });
});

describe('validatePlacement on slopes', () => {
  it('blocks an item on ground steeper than its catalog limit', () => {
    const ramp = makeRampHeightmap({ width: 60, height: 60, gradeX: 0.04 });
    const slope = (point: { x: number; y: number }) => slopeAt(ramp, point);
    expect(check({ catalogId: 'washroom-building', x: 20, y: 20 }, slope)).toEqual({
      valid: false,
      reason: 'too steep',
      label: 'washroom-building',
    });
    expect(check({ catalogId: 'swings', x: 20, y: 20 }, slope)).toEqual({ valid: true });
  });

  it('accepts items with no grade limit on any slope', () => {
    expect(check({ catalogId: 'bigleaf-maple', x: 20, y: 20 }, () => 1)).toEqual({ valid: true });
  });

  it('rejects an id the catalog does not have', () => {
    expect(check({ catalogId: 'rocket-ship', x: 20, y: 20 })).toMatchObject({
      valid: false,
      reason: 'unknown item',
    });
  });
});

describe('validatePlacement on a triangular parcel', () => {
  const triangle = withGroundOutline(flat, [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 0, y: 60 },
  ]);
  const onTriangle = (x: number, y: number) =>
    validatePlacement({
      document: doc,
      catalog: catalogIndex,
      candidate: { catalogId: 'bench', position: { x, y }, rotationDeg: 0 },
      zones: [],
      lockedFootprints: locked,
      slopeSampler: flatSlope,
      grid,
      onGround: (point) => isOnGround(triangle, point),
    });

  it('refuses a spot past the long side of the triangle', () => {
    expect(onTriangle(45, 45)).toEqual({ valid: false, reason: 'outside park', label: 'bench' });
  });

  it('takes a spot inside the triangle', () => {
    expect(onTriangle(15, 20)).toEqual({ valid: true });
  });
});
