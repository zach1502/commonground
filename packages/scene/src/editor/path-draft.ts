import type { CatalogIndex, PlanePoint } from '@parkshape/core';

import type { ScenePalette } from '../palette/colours.js';
import type { PathFeature, PathSurface } from '../types.js';

import { catmullRom, CURVE_SAMPLES_PER_SPAN } from './path-tool.js';

// A path whose surface has no catalog entry is drawn and saved 1 m wide.
const FALLBACK_WIDTH_M = 1;
const MIN_POINTS = 2;
const DRAFT_ID = 'draft-path';

/** The width a new path of this surface gets, from its catalog entry. */
export function pathWidthM(catalog: CatalogIndex, surface: PathSurface): number {
  const entry = catalog.get(`path-${surface}`);
  return entry?.geometryKind === 'linear' ? entry.footprint.widthM : FALLBACK_WIDTH_M;
}

/** Boardwalk takes the soil tint; asphalt and gravel take the path colour. */
export function pathSurfaceTint(surface: PathSurface, palette: ScenePalette): string {
  return surface === 'boardwalk' ? palette.soil : palette.pathSurface;
}

export interface DraftPathInput {
  readonly points: readonly PlanePoint[];
  readonly surface: PathSurface;
  readonly catalog: CatalogIndex;
}

/**
 * The path being drawn as the viewer will draw it once finished: its surface, its catalog width
 * and the same smoothed curve. Null until there is a segment to draw.
 */
export function draftPathFeature(input: DraftPathInput): PathFeature | null {
  if (input.points.length < MIN_POINTS) return null;
  return {
    id: DRAFT_ID,
    surface: input.surface,
    widthM: pathWidthM(input.catalog, input.surface),
    points: catmullRom(input.points, CURVE_SAMPLES_PER_SPAN).map((point) => ({
      x: point.x,
      z: point.y,
    })),
  };
}
