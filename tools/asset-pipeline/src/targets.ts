import { catalogItems, moduleKitItems, type CatalogItem, type ScalePolicy } from '@parkshape/core';

export type BudgetClass = 'trees' | 'buildings' | 'furniture' | 'modules' | 'sports';

export interface Budget {
  /** Most triangles a processed model may keep. */
  readonly triangles: number;
  /** Starting simplify error limit, as a fraction of the mesh radius. */
  readonly error: number;
}

// Ground modules and furniture are seen up close, so they start with a tighter error limit.
export const BUDGETS: Readonly<Record<BudgetClass, Budget>> = {
  trees: { triangles: 1500, error: 0.01 },
  buildings: { triangles: 3000, error: 0.005 },
  furniture: { triangles: 600, error: 0.005 },
  modules: { triangles: 300, error: 0.005 },
  sports: { triangles: 2000, error: 0.01 },
};

export interface Dims {
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
}

/** What one model must become: its catalog size, fit rule and triangle budget. */
export interface AssetTarget {
  readonly modelKey: string;
  readonly category: string;
  readonly dims: Dims;
  readonly scalePolicy: ScalePolicy;
  readonly budgetClass: BudgetClass;
}

const CLASS_BY_CATEGORY: Readonly<Record<string, BudgetClass>> = {
  tree: 'trees',
  shrub: 'trees',
  washroom: 'buildings',
  'kit-building': 'buildings',
  seating: 'furniture',
  amenity: 'furniture',
  lighting: 'furniture',
  sports: 'sports',
  play: 'sports',
};

/** Unlisted categories are ground tiles, path segments and kit parts. */
export function budgetClassFor(category: string): BudgetClass {
  return CLASS_BY_CATEGORY[category] ?? 'modules';
}

function catalogDims(item: CatalogItem): Dims {
  const { heightM } = item;
  if (item.geometryKind === 'point') {
    return { widthM: item.footprint.widthM, depthM: item.footprint.depthM, heightM };
  }
  if (item.geometryKind === 'linear') {
    // A square segment lets a square source tile fit both axes under one uniform scale.
    return { widthM: item.footprint.widthM, depthM: item.footprint.widthM, heightM };
  }
  const sideM = Math.sqrt(item.footprint.defaultAreaM2);
  return { widthM: sideM, depthM: sideM, heightM };
}

function catalogTarget(item: CatalogItem): AssetTarget {
  return {
    modelKey: item.modelKey,
    category: item.category,
    dims: catalogDims(item),
    scalePolicy: item.scalePolicy,
    budgetClass: budgetClassFor(item.category),
  };
}

const KIT_BUILDINGS = new Set(['kit-shed']);

/** One target per model key in the catalog and the module kit. */
export function assetTargets(): readonly AssetTarget[] {
  const kit = moduleKitItems.map((item): AssetTarget => {
    const category = KIT_BUILDINGS.has(item.modelKey) ? 'kit-building' : 'kit-part';
    return {
      modelKey: item.modelKey,
      category,
      dims: { widthM: item.widthM, depthM: item.depthM, heightM: item.heightM },
      scalePolicy: item.scalePolicy,
      budgetClass: budgetClassFor(category),
    };
  });
  return [...catalogItems.map(catalogTarget), ...kit];
}
