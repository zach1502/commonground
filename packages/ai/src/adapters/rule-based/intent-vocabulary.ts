import { catalogItems, type Category } from '@parkshape/core';

import type { Zone } from '../../schema/intent.js';

/** A phrase a resident might use for a catalog item or a whole category. */
export interface FeatureTerm {
  readonly phrase: string;
  readonly category: Category;
  readonly catalogId?: string;
}

type Synonym = readonly [phrase: string, category: Category, catalogId?: string];

// Paths are read as the path style, never as features, so path items stay out of the vocabulary.
const SYNONYMS: readonly Synonym[] = [
  ['dog park', 'dog', 'off-leash-area'],
  ['dog area', 'dog', 'off-leash-area'],
  ['dog run', 'dog', 'off-leash-area'],
  ['off-leash', 'dog', 'off-leash-area'],
  ['off leash', 'dog', 'off-leash-area'],
  ['water feature', 'water', 'pond'],
  ['water', 'water', 'pond'],
  ['water fountain', 'amenity', 'drinking-fountain'],
  ['fountain', 'amenity', 'drinking-fountain'],
  ['playground', 'play', 'playground-structure'],
  ['play area', 'play'],
  ['play', 'play'],
  ['swings', 'play', 'swings'],
  ['splash pad', 'play', 'spray-pad'],
  ['fitness', 'play', 'outdoor-fitness-station'],
  ['benches', 'seating'],
  ['seating', 'seating'],
  ['seats', 'seating'],
  ['picnic', 'seating', 'picnic-table'],
  ['trees', 'tree'],
  ['tree', 'tree'],
  ['shrub', 'shrub'],
  ['bushes', 'shrub'],
  ['garden', 'garden', 'community-garden'],
  ['allotment', 'garden', 'community-garden'],
  ['basketball court', 'sports', 'basketball-half-court'],
  ['basketball', 'sports', 'basketball-half-court'],
  ['tennis court', 'sports', 'tennis-court'],
  ['tennis', 'sports', 'tennis-court'],
  ['ball diamond', 'sports', 'ball-diamond-backstop'],
  ['baseball', 'sports', 'ball-diamond-backstop'],
  ['court', 'sports'],
  ['washroom', 'washroom', 'washroom-building'],
  ['toilet', 'washroom', 'washroom-building'],
  ['bathroom', 'washroom', 'washroom-building'],
  ['lights', 'lighting', 'path-light'],
  ['lighting', 'lighting', 'path-light'],
  ['bike rack', 'amenity', 'bike-rack'],
  ['bins', 'amenity', 'waste-bin'],
  ['grass', 'ground', 'lawn'],
  ['wildflowers', 'ground', 'meadow'],
  ['parking', 'parking', 'parking-lot-small'],
];

function termOf([phrase, category, catalogId]: Synonym): FeatureTerm {
  return catalogId === undefined ? { phrase, category } : { phrase, category, catalogId };
}

/** Catalog names and synonyms, longest first so "rain garden" wins over "garden". */
export const FEATURE_TERMS: readonly FeatureTerm[] = [
  ...catalogItems
    .filter((item) => item.category !== 'path')
    .map((item) => ({
      phrase: item.name.toLowerCase(),
      category: item.category,
      catalogId: item.id,
    })),
  ...SYNONYMS.map(termOf),
].sort((left, right) => right.phrase.length - left.phrase.length);

/** Count words; "lots of" means a lot and "a few" means three, as residents use them. */
export const QUANTITY_WORDS: Readonly<Record<string, number>> = {
  'lots of': 8,
  'loads of': 8,
  'plenty of': 8,
  many: 8,
  'a few': 3,
  few: 3,
  some: 3,
  several: 3,
  'a couple of': 2,
  couple: 2,
  'a pair of': 2,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** An unnumbered plural such as "benches" reads as a few. */
export const PLURAL_COUNT = 3;

/**
 * Zone words, most specific first. The parcel's street side is the front and is taken as
 * north, so "the back corner" is the south-east and "the back" is the south.
 */
export const ZONE_WORDS: readonly (readonly [RegExp, Zone])[] = [
  [/\bback corner\b/, 'south-east'],
  [/\bnorth[\s-]?east\w*/, 'north-east'],
  [/\bnorth[\s-]?west\w*/, 'north-west'],
  [/\bsouth[\s-]?east\w*/, 'south-east'],
  [/\bsouth[\s-]?west\w*/, 'south-west'],
  [/\bnorth(?:ern)?\b/, 'north'],
  [/\bsouth(?:ern)?\b/, 'south'],
  [/\beast(?:ern)?\b/, 'east'],
  [/\bwest(?:ern)?\b/, 'west'],
  [/\b(?:centre|center|middle)\b/, 'centre'],
  [/\bback\b/, 'south'],
  [/\bfront\b/, 'north'],
];
