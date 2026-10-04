import {
  catalogIndex,
  designFootprints,
  type DesignDocument,
  type Footprint,
  type HeatmapLayer,
} from '@parkshape/core';

import type { InsightsHeatmap } from '../../api/staff-api';

// Regrading reads the ground itself, and locked ground cannot change, so it keeps its cells.
const UNMASKED: ReadonlySet<HeatmapLayer> = new Set<HeatmapLayer>(['regrade']);

/** Locked elements, and features the park has today other than ground cover such as lawn. */
function isKept(footprint: Footprint): boolean {
  return footprint.locked || (footprint.existing && footprint.entry.category !== 'ground');
}

/**
 * The heat grid with the cells under kept baseline elements, such as the community garden and
 * the locked trees, set to 0. Designs carry those elements over, so they are not a resident's
 * choice. Lawn stays, because designs build on it.
 */
export function maskLockedFootprints(
  heatmap: InsightsHeatmap,
  baseline: DesignDocument | null,
): InsightsHeatmap {
  if (baseline === null || UNMASKED.has(heatmap.category)) return heatmap;
  const grid = {
    width: heatmap.width,
    height: heatmap.height,
    cellM: heatmap.cellM,
    originLocal: heatmap.originLocal,
  };
  const locked = designFootprints({ document: baseline, catalog: catalogIndex, grid }).filter(
    isKept,
  );
  if (locked.length === 0) return heatmap;
  const values = [...heatmap.values];
  locked.forEach(({ mask }) => {
    mask.cells.forEach((covered, index) => {
      if (covered === 1) values[index] = 0;
    });
  });
  return { ...heatmap, values };
}
