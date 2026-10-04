import type { CatalogItemInput } from '../../schema/catalog.js';

/** One entry per path surface; a drawn path picks its entry by surface. */
export const pathItems: readonly CatalogItemInput[] = [
  {
    id: 'path-asphalt',
    category: 'path',
    name: 'Asphalt path',
    geometryKind: 'linear',
    footprint: { widthM: 3 },
    heightM: 0.05,
    unitCost: { perM2Cad: 90 },
    surface: 'impervious',
    modelKey: 'path-asphalt',
    scalePolicy: 'segment',
  },
  {
    id: 'path-gravel',
    category: 'path',
    name: 'Gravel path',
    geometryKind: 'linear',
    footprint: { widthM: 2 },
    heightM: 0.05,
    unitCost: { perM2Cad: 45 },
    surface: 'pervious',
    modelKey: 'path-gravel',
    scalePolicy: 'segment',
  },
  {
    id: 'path-boardwalk',
    category: 'path',
    name: 'Boardwalk',
    geometryKind: 'linear',
    footprint: { widthM: 2.4 },
    heightM: 0.4,
    unitCost: { perM2Cad: 700 },
    surface: 'pervious',
    modelKey: 'path-boardwalk',
    scalePolicy: 'segment',
  },
];
