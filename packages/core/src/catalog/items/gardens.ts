import type { CatalogItemInput } from '../../schema/catalog.js';

/** Fenced areas. Fence posts sit every 2.4 m, the length of one fence panel. */
const fencedAreas: readonly CatalogItemInput[] = [
  {
    id: 'community-garden',
    category: 'garden',
    name: 'Community garden',
    geometryKind: 'area',
    footprint: {
      minAreaM2: 40,
      defaultAreaM2: 160,
      module: { kind: 'raised-bed', widthM: 1.2, depthM: 3, aisleM: 0.6 },
      perimeter: { postSpacingM: 2.4, gateCount: 1 },
    },
    heightM: 1.8,
    unitCost: { perModuleCad: 900 },
    surface: 'pervious',
    maxGrade: 0.05,
    modelKey: 'community-garden',
    scalePolicy: 'tile',
    // Raised beds that modulePlotCount fits in a square of defaultAreaM2; one bed is one plot.
    plots: 18,
  },
  {
    id: 'off-leash-area',
    category: 'dog',
    name: 'Dog off-leash area',
    geometryKind: 'area',
    footprint: {
      minAreaM2: 400,
      defaultAreaM2: 1200,
      perimeter: { postSpacingM: 2.4, gateCount: 1 },
    },
    heightM: 1.2,
    unitCost: { perM2Cad: 40 },
    surface: 'pervious',
    modelKey: 'off-leash-area',
    scalePolicy: 'tile',
  },
];

/** Garden items placed one at a time, which hold no plots. */
const gardenPoints: readonly CatalogItemInput[] = [
  {
    id: 'planter',
    category: 'garden',
    name: 'Planter',
    geometryKind: 'point',
    footprint: { widthM: 1.2, depthM: 0.9 },
    heightM: 0.53,
    unitCost: { perItemCad: 1800 },
    surface: 'pervious',
    modelKey: 'planter',
    scalePolicy: 'fixed',
  },
  {
    id: 'compost-bin',
    category: 'garden',
    name: 'Compost bin',
    geometryKind: 'point',
    footprint: { widthM: 2, depthM: 1 },
    heightM: 1,
    unitCost: { perItemCad: 800 },
    surface: 'pervious',
    modelKey: 'compost-bin',
    scalePolicy: 'fixed',
  },
];

/** Every garden item; the catalog lists the fenced areas first. */
export const fencedAreaItems: readonly CatalogItemInput[] = [...fencedAreas, ...gardenPoints];
