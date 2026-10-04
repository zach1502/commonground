import { describe, expect, it } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { itemUnderRay, type PickRay } from './ray-pick.js';
import { docOf, treeInput } from './test-fixtures.js';

const GROUND_M = 12;
const flatGround = () => GROUND_M;
const FAR = Infinity;

const bench = (id: string, x: number, y: number, rotationDeg = 0) => ({
  id,
  catalogId: 'bench',
  position: { x, y },
  rotationDeg,
  locked: false,
});

/** A ray from a camera south of the point, looking down at 30 degrees toward a spot in space. */
function rayToward(spot: { x: number; y: number; z: number }): PickRay {
  const origin = { x: spot.x, y: spot.y + 30, z: spot.z + 52 };
  const dx = spot.x - origin.x;
  const dy = spot.y - origin.y;
  const dz = spot.z - origin.z;
  const length = Math.hypot(dx, dy, dz);
  return { origin, direction: { x: dx / length, y: dy / length, z: dz / length } };
}

function pick(ray: PickRay, items: Parameters<typeof docOf>[0], before = FAR) {
  return itemUnderRay({
    ray,
    document: docOf(items),
    catalog: catalogIndex,
    elevationAt: flatGround,
    beforeM: before,
  });
}

describe('itemUnderRay', () => {
  it('picks a tree from a ray aimed at its canopy, well above the trunk base', () => {
    const items = { items: [treeInput('maple', 20, 20)] };
    const canopy = { x: 23, y: GROUND_M + 18, z: 20 };
    expect(pick(rayToward(canopy), items)).toBe('maple');
  });

  it('picks a bench from a ray aimed at the top of its back rest', () => {
    const items = { items: [bench('bench-1', 40, 40, 30)] };
    const backRest = { x: 40, y: GROUND_M + 1.1, z: 39.6 };
    expect(pick(rayToward(backRest), items)).toBe('bench-1');
  });

  it('misses a ray aimed at open ground beside the bench', () => {
    const items = { items: [bench('bench-1', 40, 40)] };
    expect(pick(rayToward({ x: 46, y: GROUND_M, z: 40 }), items)).toBeNull();
  });

  it('misses a ray aimed at the ground well clear of a tree crown', () => {
    const items = { items: [treeInput('maple', 20, 20)] };
    expect(pick(rayToward({ x: 34, y: GROUND_M, z: 20 }), items)).toBeNull();
  });

  it('picks the nearer item when two line up along the ray', () => {
    const items = { items: [bench('far', 40, 40), bench('near', 40, 46)] };
    const ray: PickRay = {
      origin: { x: 40, y: GROUND_M + 0.5, z: 60 },
      direction: { x: 0, y: 0, z: -1 },
    };
    expect(pick(ray, items)).toBe('near');
  });

  it('ignores an item behind the ground the ray hit first', () => {
    const items = { items: [treeInput('maple', 20, 20)] };
    const canopy = { x: 20, y: GROUND_M + 18, z: 20 };
    expect(pick(rayToward(canopy), items, 1)).toBeNull();
  });
});
