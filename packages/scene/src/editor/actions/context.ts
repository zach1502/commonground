import {
  gridOf,
  isOnGround,
  sampleAt,
  slopeAt,
  withGradeDelta,
  DEFAULT_TERRAFORM_LIMIT_M,
  ROOT_ZONE_RADIUS_PER_DBH_CM,
  type CatalogIndex,
  type Footprint,
  type Grid,
  type Heightmap,
  type PlanePoint,
  type Random,
  type Zone,
} from '@parkshape/core';

import { lockedFootprints } from '../placement-validity.js';
import type { EditorStore } from '../store/editor-store.js';

/** The plus or minus cut and fill band and the root-zone radius rule from the project. */
export interface TerraformLimits {
  readonly maxDeviationM: number;
  readonly rootZonePerDbhCm: number;
}

/** Everything the editor rules need beyond the store; built once per open design. */
export interface EditorContext {
  readonly store: EditorStore;
  readonly catalog: CatalogIndex;
  readonly random: Random;
  /** Terrain with the design's grading applied. */
  readonly heightmap: Heightmap;
  /** Existing terrain before any grading; the terraform base. */
  readonly baseHeightmap: Heightmap;
  readonly grid: Grid;
  /** The project's forbidden and no-grade zones. */
  readonly zones: readonly Zone[];
  /** Locked elements never move, so their footprints are worked out once. */
  readonly locked: readonly Footprint[];
  readonly terraform: TerraformLimits;
  readonly elevationAt: (point: PlanePoint) => number;
  readonly slopeAt: (point: PlanePoint) => number;
  /** Whether a point is inside the parcel outline the ground is cut to, or anywhere on a box. */
  readonly onGround: (point: PlanePoint) => boolean;
}

export interface EditorContextInput {
  readonly store: EditorStore;
  readonly catalog: CatalogIndex;
  readonly random: Random;
  readonly heightmap: Heightmap;
  readonly zones: readonly Zone[];
  readonly terraform?: TerraformLimits;
}

const DEFAULT_LIMITS: TerraformLimits = {
  maxDeviationM: DEFAULT_TERRAFORM_LIMIT_M,
  rootZonePerDbhCm: ROOT_ZONE_RADIUS_PER_DBH_CM,
};

export function createEditorContext(input: EditorContextInput): EditorContext {
  const { document } = input.store.getState();
  const heightmap = withGradeDelta(input.heightmap, document.gradeDelta);
  const grid = gridOf(heightmap);
  return {
    ...input,
    heightmap,
    baseHeightmap: input.heightmap,
    grid,
    terraform: input.terraform ?? DEFAULT_LIMITS,
    locked: lockedFootprints({ document, catalog: input.catalog, grid }),
    elevationAt: (point) => sampleAt(heightmap, point),
    slopeAt: (point) => slopeAt(heightmap, point),
    onGround: (point) => isOnGround(heightmap, point),
  };
}
