import type { Heightmap, Random } from '@parkshape/core';

import type { ScenePalette } from '../palette/colours.js';
import type { AreaFeature, GroundPoint, MeshArrays } from '../types.js';

import { buildAreaMesh, fillModules, samplePerimeter } from './area-fill.js';
import type { ModuleGrid } from './area-fill.js';
import { areaTreatment, gateIndex } from './area-style.js';
import type { InstanceTransform } from './instances.js';
import { elevationAt } from './sample.js';

// Fence posts every 2.5 m, a common spacing for welded mesh panels.
const FENCE_SPACING_M = 2.5;

export interface FenceLayout {
  readonly posts: readonly InstanceTransform[];
  readonly panels: readonly InstanceTransform[];
  readonly panelLengthM: number;
}

export interface AreaLayout {
  readonly surface: MeshArrays;
  readonly surfaceColour: keyof ScenePalette;
  readonly fence?: FenceLayout;
  readonly beds: readonly InstanceTransform[];
  readonly bedGrid?: ModuleGrid;
}

export interface AreaLayoutInput {
  readonly heightmap: Heightmap;
  readonly area: AreaFeature;
  readonly paths: readonly (readonly GroundPoint[])[];
  readonly random: Random;
}

function fenceLayout(input: AreaLayoutInput): FenceLayout {
  const perimeter = samplePerimeter(input.heightmap, input.area.outline, FENCE_SPACING_M);
  const gate = gateIndex(perimeter.panels, input.paths);
  return {
    posts: perimeter.posts.map((position) => ({ position, rotationY: 0, scale: 1 })),
    panels: perimeter.panels
      .filter((_, index) => index !== gate)
      .map((panel) => ({ ...panel, scale: 1 })),
    panelLengthM: perimeter.panelLengthM,
  };
}

/** Everything drawn for one area: its ground, its fence with a gate, and any beds inside. */
export function layoutArea(input: AreaLayoutInput): AreaLayout {
  const treatment = areaTreatment(input.area.kind);
  const surface = buildAreaMesh(input.heightmap, input.area.outline, {});
  const grid = treatment.modules;
  const beds =
    grid === undefined
      ? []
      : fillModules(input.area.outline, grid, input.random).map((centre) => ({
          position: { ...centre, y: elevationAt(input.heightmap, centre) },
          rotationY: 0,
          scale: 1,
        }));
  return {
    surface,
    surfaceColour: treatment.surface,
    beds,
    ...(treatment.fence === 'fenced' ? { fence: fenceLayout(input) } : {}),
    ...(grid === undefined ? {} : { bedGrid: grid }),
  };
}
