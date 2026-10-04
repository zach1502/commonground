import type { Heightmap, Random } from '@parkshape/core';

import type { CatalogItem, ItemCategory, PlacedItem, Vector3 } from '../types.js';

import { elevationAt } from './sample.js';
import { symmetric } from './vector-layout.js';

// DESIGN.md: trees vary in size within 10 percent so a group does not look copied.
const TREE_SCALE_VARIATION = 0.1;
/**
 * The owner's call: the viewer shows each tree at its 15-year size, half the mature model the
 * pipeline fits to the catalog height, scaled uniformly so crown and height shrink together.
 */
export const TREE_15_YEAR_FACTOR = 0.5;
// DESIGN.md "Props and density": foliage varies within 6 percent lightness.
const FOLIAGE_TINT_VARIATION = 0.06;

export class ScaleError extends Error {
  readonly kind = 'non-uniform-scale';

  constructor(
    readonly itemId: string,
    readonly requested: Vector3,
  ) {
    super(`Item ${itemId} asks for a non-uniform scale`);
    this.name = 'ScaleError';
  }
}

export class UnknownCatalogItemError extends Error {
  readonly kind = 'unknown-catalog-item';

  constructor(
    readonly itemId: string,
    readonly catalogId: string,
  ) {
    super(`Item ${itemId} names catalog item ${catalogId}, which is not in the catalog`);
    this.name = 'UnknownCatalogItemError';
  }
}

export type InstanceError = ScaleError | UnknownCatalogItemError;

export interface InstanceTransform {
  readonly position: Vector3;
  readonly rotationY: number;
  /** One factor for all three axes; meshes are never scaled non-uniformly. */
  readonly scale: number;
  /** Lightness change for instanceColor, -0.06 to 0.06 on trees and 0 elsewhere. */
  readonly tint?: number;
}

export interface InstanceGroup {
  readonly modelKey: string;
  readonly category: ItemCategory;
  readonly transforms: readonly InstanceTransform[];
}

export interface InstanceInput {
  readonly heightmap: Heightmap;
  readonly items: readonly PlacedItem[];
  readonly catalog: readonly CatalogItem[];
  readonly random: Random;
}

function uniformScale(item: PlacedItem): number {
  const { scale } = item;
  if (typeof scale === 'number') {
    return scale;
  }
  if (scale.x !== scale.y || scale.y !== scale.z) {
    throw new ScaleError(item.id, scale);
  }
  return scale.x;
}

function variedScale(base: number, category: ItemCategory, random: Random): number {
  if (category !== 'tree') {
    return base;
  }
  return base * TREE_15_YEAR_FACTOR * (1 + symmetric(random.next()) * TREE_SCALE_VARIATION);
}

function foliageTint(category: ItemCategory, random: Random): number {
  return category === 'tree' ? symmetric(random.next()) * FOLIAGE_TINT_VARIATION : 0;
}

/** Groups placed items into one instance list per model, set on the terrain. */
export function groupInstances(input: InstanceInput): ReadonlyMap<string, InstanceGroup> {
  const byId = new Map(input.catalog.map((entry) => [entry.id, entry]));
  const groups = new Map<string, { category: ItemCategory; transforms: InstanceTransform[] }>();
  input.items.forEach((item) => {
    const entry = byId.get(item.catalogId);
    if (entry === undefined) {
      throw new UnknownCatalogItemError(item.id, item.catalogId);
    }
    const scale = variedScale(uniformScale(item), entry.category, input.random);
    const tint = foliageTint(entry.category, input.random);
    const group = groups.get(entry.modelKey) ?? { category: entry.category, transforms: [] };
    group.transforms.push({
      position: { ...item.position, y: elevationAt(input.heightmap, item.position) },
      rotationY: item.rotationY,
      scale,
      tint,
    });
    groups.set(entry.modelKey, group);
  });
  return new Map([...groups].map(([modelKey, group]) => [modelKey, { modelKey, ...group }]));
}

/** Column-major 4 x 4 matrix for a uniform scale, a turn about y and a translation. */
export function instanceMatrix(transform: InstanceTransform): number[] {
  const { position, rotationY, scale } = transform;
  const cos = Math.cos(rotationY) * scale;
  const sin = Math.sin(rotationY) * scale;
  return [cos, 0, -sin, 0, 0, scale, 0, 0, sin, 0, cos, 0, position.x, position.y, position.z, 1];
}
