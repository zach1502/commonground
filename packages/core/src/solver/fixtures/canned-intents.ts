import { intentSchema, type Intent } from '../intent.js';

/** Trees read from the dog park sentence, which asks for lots of trees. */
const DOG_PARK_TREE_COUNT = 8;
/** Count read for a plural with no number, such as "native shrubs" or "a few picnic tables". */
const UNNUMBERED_PLURAL_COUNT = 3;

/** Hand-read intents for the ten canned sentences in the packages/ai intent contract. */
export const CANNED_INTENTS: readonly Intent[] = [
  {
    features: [
      { catalogId: 'off-leash-area', category: 'dog', count: 1, placement: { zone: 'south-east' } },
      { catalogId: 'pond', category: 'water', count: 1, placement: { terrain: 'low' } },
      { category: 'tree', count: DOG_PARK_TREE_COUNT },
    ],
    paths: { style: 'loop' },
    canopy: 'maximize',
    character: 'natural',
  },
  {
    features: [
      { category: 'seating', count: 2, placement: { near: 'the playground' } },
      { catalogId: 'drinking-fountain', count: 1 },
    ],
    paths: { style: 'connect-all' },
    canopy: 'add-some',
    character: 'active',
  },
  {
    features: [
      { catalogId: 'meadow', count: 1 },
      { category: 'shrub', count: UNNUMBERED_PLURAL_COUNT, placement: { terrain: 'edge' } },
    ],
    paths: { style: 'minimal' },
    canopy: 'keep-existing',
    character: 'natural',
  },
  {
    features: [
      {
        catalogId: 'community-garden',
        count: 1,
        size: 'large',
        placement: { zone: 'north-west', terrain: 'flat' },
      },
    ],
    paths: { style: 'loop' },
    canopy: 'add-some',
    character: 'open-lawn',
  },
  {
    features: [
      { catalogId: 'basketball-half-court', count: 1, placement: { awayFrom: 'the houses' } },
    ],
    paths: { style: 'connect-all' },
    canopy: 'add-some',
    character: 'active',
  },
  {
    features: [
      { catalogId: 'lawn', count: 1, placement: { zone: 'centre' } },
      { catalogId: 'picnic-table', count: UNNUMBERED_PLURAL_COUNT },
    ],
    paths: { style: 'loop' },
    canopy: 'keep-existing',
    character: 'open-lawn',
  },
  {
    features: [{ category: 'tree', count: UNNUMBERED_PLURAL_COUNT }],
    paths: { style: 'minimal', surface: 'gravel' },
    canopy: 'add-some',
    character: 'natural',
  },
  {
    features: [
      { catalogId: 'spray-pad', count: 1, size: 'small' },
      { catalogId: 'swings', count: 1 },
    ],
    paths: { style: 'connect-all' },
    canopy: 'add-some',
    character: 'active',
  },
  {
    features: [
      { catalogId: 'path-light', count: UNNUMBERED_PLURAL_COUNT },
      { catalogId: 'washroom-building', count: 1 },
    ],
    paths: { style: 'connect-all', surface: 'asphalt' },
    canopy: 'add-some',
    character: 'active',
  },
  {
    features: [
      { category: 'tree', count: UNNUMBERED_PLURAL_COUNT, placement: { terrain: 'high' } },
    ],
    paths: { style: 'loop' },
    canopy: 'maximize',
    character: 'natural',
  },
].map((intent) => intentSchema.parse(intent));
