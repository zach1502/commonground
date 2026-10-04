import { designOf, type DesignParts } from '../metrics/fixtures/design-builders.js';
import type { Grid } from '../metrics/raster.js';

import type { InsightDesign, InsightMetrics } from './types.js';

/** A 10 by 10 grid of 1 m cells from the local origin. */
export const TEN_BY_TEN: Grid = { width: 10, height: 10, cellM: 1, originLocal: { x: 0, y: 0 } };

export interface SyntheticDesign {
  readonly id: string;
  readonly parts?: DesignParts;
  readonly metrics?: InsightMetrics | null;
  readonly up?: number;
  readonly down?: number;
}

export function syntheticDesign(design: SyntheticDesign): InsightDesign {
  return {
    id: design.id,
    title: `Design ${design.id}`,
    authorId: `author-${design.id}`,
    document: designOf(design.parts),
    metrics: design.metrics ?? null,
    up: design.up ?? 0,
    down: design.down ?? 0,
  };
}
