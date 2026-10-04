import type { ItemCategory } from '../types.js';

import type { InstanceGroup, InstanceTransform } from './instances.js';

/** Ground overlays such as paths, areas, water and the terrain are surfaces. */
export type ShadowSubject = ItemCategory | 'surface';
export type ShadowRole = 'cast' | 'receive';

// A blob this many metres across under a tree at scale 1; it scales with the tree.
const BLOB_DIAMETER_M = 9;
// Lifts the blob off the ground so it does not flicker against the terrain.
const BLOB_LIFT_M = 0.05;

/** DESIGN.md "Shadows": trees, buildings, benches, lamp posts and figures cast; surfaces receive. */
export function shadowRole(subject: ShadowSubject): ShadowRole {
  return subject === 'surface' ? 'receive' : 'cast';
}

/** The instance groups that draw into the shadow map. */
export function casterGroups(groups: ReadonlyMap<string, InstanceGroup>): InstanceGroup[] {
  return [...groups.values()].filter((group) => shadowRole(group.category) === 'cast');
}

/**
 * One flat blob per tree, sized to the tree's scale: the only shadow on the phone tier. The
 * blob quad is 1 m across, so the transform scale is its diameter.
 */
export function blobShadows(groups: ReadonlyMap<string, InstanceGroup>): InstanceTransform[] {
  return [...groups.values()]
    .filter((group) => group.category === 'tree')
    .flatMap((group) =>
      group.transforms.map((transform) => ({
        position: { ...transform.position, y: transform.position.y + BLOB_LIFT_M },
        rotationY: 0,
        scale: transform.scale * BLOB_DIAMETER_M,
      })),
    );
}
