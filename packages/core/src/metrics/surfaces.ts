import type { Surface } from '../schema/catalog.js';

import type { Footprint } from './footprints.js';
import { coveragePercent, union, type Mask } from './raster.js';

export interface SurfaceMeasure {
  readonly imperviousPercent: number;
  readonly waterPercent: number;
}

function coverOf(footprints: readonly Footprint[], parcel: Mask, surface: Surface): number {
  const masks = footprints.filter(({ entry }) => entry.surface === surface).map(({ mask }) => mask);
  return coveragePercent(union(parcel.grid, masks), parcel);
}

/** Share of the parcel under impervious cover and under water, each counted once per cell. */
export function measureSurfaces(footprints: readonly Footprint[], parcel: Mask): SurfaceMeasure {
  return {
    imperviousPercent: coverOf(footprints, parcel, 'impervious'),
    waterPercent: coverOf(footprints, parcel, 'water'),
  };
}
