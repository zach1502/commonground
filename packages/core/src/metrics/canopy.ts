import type { CatalogIndex } from '../catalog/catalog.js';
import type { DesignDocument } from '../schema/design.js';

import {
  coveragePercent,
  intersectCount,
  rasterizeCircle,
  union,
  type Grid,
  type Mask,
} from './raster.js';

export interface CanopyInput {
  readonly document: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly grid: Grid;
  readonly parcel: Mask;
}

export interface CanopyMeasure {
  readonly percent: number;
  /** Crown area inside the parcel. */
  readonly areaM2: number;
}

/** Union of mature crowns, so overlapping trees count once, as a share of the parcel. */
export function measureCanopy(input: CanopyInput): CanopyMeasure {
  const { document, catalog, grid, parcel } = input;
  const crowns = document.items.flatMap((item) => {
    const radius = catalog.get(item.catalogId)?.crownRadiusMatureM;
    return radius === undefined ? [] : [rasterizeCircle(grid, item.position, radius)];
  });
  const canopy = union(grid, crowns);
  return {
    percent: coveragePercent(canopy, parcel),
    areaM2: intersectCount(canopy, parcel) * grid.cellM * grid.cellM,
  };
}
