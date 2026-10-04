import type {
  CatalogIndex,
  CatalogItem as CoreCatalogItem,
  Category,
  DesignDocument,
  PlanePoint,
  Random,
} from '@parkshape/core';

import type {
  AreaFeature,
  AreaKind,
  CatalogItem,
  GroundPoint,
  ItemCategory,
  ParkDocument,
  PlacedItem,
  WaterFeature,
} from '../types.js';

import { catmullRom, CURVE_SAMPLES_PER_SPAN } from './path-tool.js';

const DEGREES_PER_HALF_TURN = 180;
// symmetric(0.5) is 0, so the viewer adds no size change of its own.
const MIDDLE = 0.5;

/** Items already carry their scale jitter; this keeps the viewer from adding more. */
export const NO_VARIATION: Random = { next: () => MIDDLE };

const ITEM_CATEGORIES: Partial<Record<Category, ItemCategory>> = {
  tree: 'tree',
  shrub: 'shrub',
  seating: 'bench',
  washroom: 'building',
  play: 'play',
};

const AREA_KINDS: Partial<Record<Category, AreaKind>> = {
  garden: 'garden',
  play: 'playground',
  dog: 'dog-park',
};

// Core's local y (north) is the scene's z; see geometry/grid.ts.
const ground = (point: PlanePoint): GroundPoint => ({ x: point.x, z: point.y });

export function sceneCatalogOf(catalog: readonly CoreCatalogItem[]): CatalogItem[] {
  return catalog.map((entry) => ({
    id: entry.id,
    modelKey: entry.modelKey,
    category: ITEM_CATEGORIES[entry.category] ?? 'other',
  }));
}

function placedItems(document: DesignDocument, catalog: CatalogIndex): PlacedItem[] {
  return document.items
    .filter((item) => catalog.get(item.catalogId)?.geometryKind === 'point')
    .map((item) => ({
      id: item.id,
      catalogId: item.catalogId,
      position: ground(item.position),
      // Core turns counter-clockwise from east in (x, y); mirrored onto (x, z) that is -y.
      rotationY: (-item.rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN,
      scale: item.scaleJitter ?? 1,
    }));
}

function areaLayers(document: DesignDocument, catalog: CatalogIndex) {
  const areas: AreaFeature[] = [];
  const water: WaterFeature[] = [];
  document.areas.forEach((area) => {
    const category = catalog.get(area.catalogId)?.category;
    const outline = area.polygon.map(ground);
    if (category === 'water') water.push({ id: area.id, outline });
    else areas.push({ id: area.id, kind: AREA_KINDS[category ?? 'ground'] ?? 'lawn', outline });
  });
  return { areas, water };
}

/** The design in the viewer's shape, so the editor draws with the same components. */
export function toParkDocument(document: DesignDocument, catalog: CatalogIndex): ParkDocument {
  return {
    items: placedItems(document, catalog),
    paths: document.paths.map((path) => ({
      id: path.id,
      widthM: path.widthM,
      surface: path.surface,
      points: catmullRom(path.points, CURVE_SAMPLES_PER_SPAN).map(ground),
    })),
    ...areaLayers(document, catalog),
  };
}
