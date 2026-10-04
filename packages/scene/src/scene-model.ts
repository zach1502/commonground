import type { Heightmap, Random } from '@parkshape/core';

import { layoutArea } from './geometry/area-layout.js';
import type { AreaLayout } from './geometry/area-layout.js';
import { groupInstances } from './geometry/instances.js';
import type { InstanceGroup } from './geometry/instances.js';
import { heightmapBounds } from './geometry/sample.js';
import type { SceneBounds } from './geometry/sample.js';
import type { CatalogItem, ParkDocument } from './types.js';

export interface SceneModelInput {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly catalog: readonly CatalogItem[];
  readonly random: Random;
}

export interface SceneModel {
  readonly groups: ReadonlyMap<string, InstanceGroup>;
  readonly areas: readonly (AreaLayout & { readonly id: string })[];
  readonly bounds: SceneBounds;
}

/** Everything the viewer draws for a design, worked out before any three.js object exists. */
export function buildSceneModel(input: SceneModelInput): SceneModel {
  const paths = input.document.paths.map((path) => path.points);
  return {
    groups: groupInstances({ ...input, items: input.document.items }),
    areas: input.document.areas.map((area) => ({
      id: area.id,
      ...layoutArea({ heightmap: input.heightmap, area, paths, random: input.random }),
    })),
    bounds: heightmapBounds(input.heightmap),
  };
}
