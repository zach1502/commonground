import {
  catalogIndex,
  catalogItems,
  makeFlatHeightmap,
  parcelGrid,
  withGroundOutline,
  type Category,
  type DesignDocument,
  type Heightmap,
  type Parcel,
} from '@parkshape/core';

import { toParkDocument } from '../editor/document-adapter.js';
import type { CatalogItem, ItemCategory, ParkDocument } from '../types.js';

// The viewer draws point items in five broad classes; areas and paths carry their own kind.
const ITEM_CATEGORY: Partial<Record<Category, ItemCategory>> = {
  tree: 'tree',
  shrub: 'shrub',
  seating: 'bench',
  play: 'play',
  washroom: 'building',
};

function itemCategory(category: Category): ItemCategory {
  return ITEM_CATEGORY[category] ?? 'other';
}

/** The catalog in the viewer's shape, so a design page and a thumbnail draw the same models. */
export const viewerCatalog: readonly CatalogItem[] = catalogItems.map((item) => ({
  id: item.id,
  modelKey: item.modelKey,
  category: itemCategory(item.category),
}));

/** The viewer inputs for one design: a flat parcel heightmap and the design in the viewer's shape. */
export interface ViewerScene {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly catalog: readonly CatalogItem[];
}

/**
 * Builds the heightmap and viewer document for a design. With the project's recorded terrain,
 * the render shows the slopes and the soil on the steep banks, as the hero does. Without it,
 * terrain is the flat parcel grid the submit check measures on.
 */
export function viewerScene(
  document: DesignDocument,
  parcel: Parcel,
  terrain?: Heightmap,
): ViewerScene {
  return {
    heightmap: withGroundOutline(terrain ?? makeFlatHeightmap(parcelGrid(parcel)), parcel.polygon),
    document: toParkDocument(document, catalogIndex),
    catalog: viewerCatalog,
  };
}
