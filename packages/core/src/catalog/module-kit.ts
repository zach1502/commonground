import { moduleKitItemSchema, type ModuleKitItem } from '../schema/catalog.js';

/** Parts the scene assembles into gardens and fences. Only fence panels repeat to fill a run. */
export const moduleKitItems: readonly ModuleKitItem[] = moduleKitItemSchema.array().parse([
  {
    id: 'raised-bed',
    name: 'Raised bed',
    widthM: 1.2,
    depthM: 3,
    heightM: 0.45,
    modelKey: 'kit-raised-bed',
    scalePolicy: 'fixed',
  },
  {
    id: 'fence-post',
    name: 'Fence post',
    widthM: 0.19,
    depthM: 0.19,
    heightM: 1.2,
    modelKey: 'kit-fence-post',
    scalePolicy: 'fixed',
  },
  {
    id: 'fence-panel',
    name: 'Fence panel',
    widthM: 2.4,
    depthM: 0.05,
    heightM: 1.2,
    modelKey: 'kit-fence-panel',
    scalePolicy: 'tile',
  },
  {
    id: 'gate',
    name: 'Gate',
    widthM: 1.2,
    depthM: 0.116,
    heightM: 1.2,
    modelKey: 'kit-gate',
    scalePolicy: 'fixed',
  },
  {
    id: 'shed',
    name: 'Tool shed',
    widthM: 2.4,
    depthM: 2.48,
    heightM: 2.4,
    modelKey: 'kit-shed',
    scalePolicy: 'fixed',
  },
]);
