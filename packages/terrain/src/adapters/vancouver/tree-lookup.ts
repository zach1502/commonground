import { catalogIdSchema, catalogIndex, type CatalogId } from '@parkshape/core';

/** Trees with a trunk wider than this at breast height start locked: they take decades to replace. */
export const LOCK_DBH_CM = 30;
/** Open-grown crown diameter runs about 25 times trunk diameter, so radius is 0.125 m per cm. */
const CROWN_RADIUS_PER_DBH_CM = 0.125;
const MIN_CROWN_RADIUS_M = 1;
const DEFAULT_MATURE_CROWN_RADIUS_M = 4;
const ROUNDING = 10;

interface TreeRule {
  readonly genus: string;
  readonly species?: string;
  readonly catalogId?: string;
  readonly crownRadiusMatureM?: number;
}

// Species rules come before the genus rule they refine. Genus crowns are for common Vancouver
// street cultivars at maturity.
const TREE_RULES: readonly TreeRule[] = [
  { genus: 'THUJA', species: 'PLICATA', catalogId: 'western-red-cedar' },
  { genus: 'PSEUDOTSUGA', catalogId: 'douglas-fir' },
  { genus: 'QUERCUS', species: 'GARRYANA', catalogId: 'garry-oak' },
  { genus: 'ALNUS', species: 'RUBRA', catalogId: 'red-alder' },
  { genus: 'ACER', species: 'MACROPHYLLUM', catalogId: 'bigleaf-maple' },
  { genus: 'ACER', species: 'CIRCINATUM', catalogId: 'vine-maple' },
  { genus: 'PRUNUS', species: 'SERRULATA', catalogId: 'flowering-cherry' },
  { genus: 'THUJA', crownRadiusMatureM: 5.5 },
  { genus: 'QUERCUS', crownRadiusMatureM: 7 },
  { genus: 'ACER', crownRadiusMatureM: 5 },
  { genus: 'PRUNUS', crownRadiusMatureM: 4 },
  { genus: 'MALUS', crownRadiusMatureM: 4 },
  { genus: 'CRATAEGUS', crownRadiusMatureM: 4 },
  { genus: 'ZELKOVA', crownRadiusMatureM: 7 },
  { genus: 'ROBINIA', crownRadiusMatureM: 6 },
  { genus: 'CORYLUS', crownRadiusMatureM: 3 },
];

export interface TreeRecord {
  readonly genus: string;
  readonly species: string;
  readonly dbhCm: number | undefined;
}

export interface TreeProfile {
  readonly catalogId?: CatalogId;
  readonly crownRadiusMatureM: number;
  readonly crownRadiusM: number;
  readonly suggestedLocked: boolean;
}

function matchingRule(tree: TreeRecord): TreeRule | undefined {
  const genus = tree.genus.toUpperCase();
  const species = tree.species.toUpperCase();
  return TREE_RULES.find(
    (rule) => rule.genus === genus && (rule.species === undefined || rule.species === species),
  );
}

function catalogCrown(catalogId: CatalogId): number | undefined {
  const item = catalogIndex.get(catalogId);
  return item !== undefined && 'crownRadiusMatureM' in item ? item.crownRadiusMatureM : undefined;
}

const round1 = (value: number) => Math.round(value * ROUNDING) / ROUNDING;

/** Catalog match, crown size and lock suggestion for a street tree record. */
export function treeProfile(tree: TreeRecord): TreeProfile {
  const rule = matchingRule(tree);
  const catalogId =
    rule?.catalogId === undefined ? undefined : catalogIdSchema.parse(rule.catalogId);
  const crownRadiusMatureM =
    (catalogId === undefined ? undefined : catalogCrown(catalogId)) ??
    rule?.crownRadiusMatureM ??
    DEFAULT_MATURE_CROWN_RADIUS_M;
  const dbhCm = tree.dbhCm ?? 0;
  const estimate = Math.max(MIN_CROWN_RADIUS_M, dbhCm * CROWN_RADIUS_PER_DBH_CM);
  return {
    ...(catalogId === undefined ? {} : { catalogId }),
    crownRadiusMatureM,
    crownRadiusM: round1(Math.min(crownRadiusMatureM, estimate)),
    suggestedLocked: dbhCm > LOCK_DBH_CM,
  };
}
