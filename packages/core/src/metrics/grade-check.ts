import type { ItemId } from '../schema/ids.js';

import type { Footprint } from './footprints.js';
import { slopeAt, type Heightmap } from './heightmap.js';
import { cellCentre, maskIndexes } from './raster.js';

export interface FootprintGrade {
  readonly id: ItemId;
  readonly label: string;
  /** Steepest slope at any covered cell centre. */
  readonly grade: number;
  readonly limit: number;
}

function steepestUnder(heightmap: Heightmap, footprint: Footprint): number {
  const { grid } = footprint.mask;
  const slopes = maskIndexes(footprint.mask).map((index) =>
    slopeAt(heightmap, cellCentre(grid, index % grid.width, Math.floor(index / grid.width))),
  );
  return Math.max(0, ...slopes);
}

/**
 * The grade under each new item or area whose catalog entry sets a maximum grade. Locked and
 * existing elements are the park as it is today, not the resident's change, so they are skipped.
 */
export function measureFootprintGrades(
  heightmap: Heightmap,
  footprints: readonly Footprint[],
): FootprintGrade[] {
  return footprints.flatMap((footprint) => {
    const limit = footprint.entry.maxGrade;
    const { locked, existing, kind } = footprint;
    if (limit === undefined || locked || existing || kind === 'path') return [];
    const { id, label } = footprint;
    return [{ id, label, grade: steepestUnder(heightmap, footprint), limit }];
  });
}
