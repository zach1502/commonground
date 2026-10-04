import type { CatalogIndex, DesignDocument, DesignItem, PlanePoint } from '@parkshape/core';

import type { Vector3 } from '../types.js';

import { MIN_PICK_HALF_M } from './selection.js';

/** A pointer ray in world space: x east, y up, z the plan's y. */
export interface PickRay {
  readonly origin: Vector3;
  /** Unit length. */
  readonly direction: Vector3;
}

export interface RayPickInput {
  readonly ray: PickRay;
  readonly document: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly elevationAt: (point: PlanePoint) => number;
  /** Distance along the ray to the ground it hit; an item farther than that is hidden. */
  readonly beforeM: number;
}

const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;

/** The item's model as a box turned with the item: half sizes across and along, and its height. */
interface PickBox {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly heightM: number;
}

/**
 * A box that holds the whole model, not only its base: a tree's box spans its mature crown and
 * its full height, and a bench's box reaches the top of its back.
 */
function pickBoxOf(item: DesignItem, catalog: CatalogIndex): PickBox | null {
  const entry = catalog.get(item.catalogId);
  if (entry?.geometryKind !== 'point') return null;
  const scale = item.scaleJitter ?? 1;
  const crown = entry.crownRadiusMatureM ?? 0;
  const halfOf = (sizeM: number) => Math.max(sizeM * HALF * scale, crown * scale, MIN_PICK_HALF_M);
  return {
    halfWidth: halfOf(entry.footprint.widthM),
    halfDepth: halfOf(entry.footprint.depthM),
    heightM: entry.heightM * scale,
  };
}

/** The ray turned into the item's own frame, with the item's base at the origin. */
function localRay(ray: PickRay, item: DesignItem, groundM: number): PickRay {
  const angle = (item.rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turn = (x: number, z: number) => ({ along: x * cos + z * sin, across: -x * sin + z * cos });
  const origin = turn(ray.origin.x - item.position.x, ray.origin.z - item.position.y);
  const direction = turn(ray.direction.x, ray.direction.z);
  return {
    origin: { x: origin.along, y: ray.origin.y - groundM, z: origin.across },
    direction: { x: direction.along, y: ray.direction.y, z: direction.across },
  };
}

/** Entry and exit distances of the ray through one slab, or null when it misses. */
function slab(origin: number, direction: number, low: number, high: number) {
  if (direction === 0)
    return origin < low || origin > high ? null : { near: -Infinity, far: Infinity };
  const a = (low - origin) / direction;
  const b = (high - origin) / direction;
  return { near: Math.min(a, b), far: Math.max(a, b) };
}

/** Distance along the ray to where it enters the box, or null when it misses. */
function boxDistance(ray: PickRay, box: PickBox): number | null {
  const slabs = [
    slab(ray.origin.x, ray.direction.x, -box.halfWidth, box.halfWidth),
    slab(ray.origin.y, ray.direction.y, 0, box.heightM),
    slab(ray.origin.z, ray.direction.z, -box.halfDepth, box.halfDepth),
  ];
  let near = 0;
  let far = Infinity;
  for (const entry of slabs) {
    if (entry === null) return null;
    near = Math.max(near, entry.near);
    far = Math.min(far, entry.far);
  }
  return near <= far ? near : null;
}

/**
 * The nearest item whose model the pointer ray passes through before it reaches the ground, or
 * null. Each model is a box sized to the whole model, so a click on a tree's canopy or a bench's
 * back selects it, not only a click on its base.
 */
export function itemUnderRay(input: RayPickInput): string | null {
  const { ray, document, catalog, elevationAt, beforeM } = input;
  let best: { id: string; distance: number } | null = null;
  for (const item of document.items) {
    const box = pickBoxOf(item, catalog);
    if (box === null) continue;
    const distance = boxDistance(localRay(ray, item, elevationAt(item.position)), box);
    if (distance === null || distance > beforeM) continue;
    if (best === null || distance < best.distance) best = { id: item.id, distance };
  }
  return best?.id ?? null;
}
