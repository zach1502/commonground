import type { CatalogItemInput } from '../../schema/catalog.js';

export const waterItems: readonly CatalogItemInput[] = [
  {
    id: 'pond',
    category: 'water',
    name: 'Pond',
    geometryKind: 'area',
    footprint: { minAreaM2: 50, defaultAreaM2: 300 },
    heightM: 0.1,
    unitCost: { perM2Cad: 400 },
    surface: 'water',
    modelKey: 'pond',
    scalePolicy: 'tile',
  },
  {
    id: 'rain-garden',
    category: 'water',
    name: 'Rain garden',
    geometryKind: 'area',
    footprint: { minAreaM2: 10, defaultAreaM2: 40 },
    heightM: 0.8,
    unitCost: { perM2Cad: 500 },
    surface: 'pervious',
    modelKey: 'rain-garden',
    scalePolicy: 'tile',
  },
];
