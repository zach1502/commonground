import {
  catalogIndex,
  computeMetrics,
  createSeededRandom,
  isSubmittable,
  solveLayout,
  validateDesignAgainstCatalog,
  type DesignDocument,
  type Intent,
  type IntentFeature,
  type MetricsReport,
  type PathStyle,
} from '@parkshape/core';

import { LEAD_TAGS, type LeadTag, type SeedTag } from './fragments.js';
import { missedTargets, nextIntent } from './intent-tuning.js';
import type { SeedSite } from './jonathan-rogers.js';

export const GENERATED_COUNT = 25;
// Layout seeds for generated designs start here, well clear of the hand-picked seeds.
const GENERATED_SEED_BASE = 1000;
// A seed that gives a layout breaking a hard rule is replaced by the next one, up to this many.
const MAX_SOLVE_ATTEMPTS = 5;
const SEED_STEP = 100;

const PATH_STYLES: readonly PathStyle[] = ['loop', 'connect-all', 'minimal'];
const CANOPY = ['keep-existing', 'add-some', 'maximize'] as const;
const SIZES = ['small', 'medium', 'large'] as const;
const ZONES = ['north', 'south', 'east', 'west', 'north-west', 'south-east'] as const;
const EXTRA_TREES = 6;
const BENCH_KINDS = 3;
// The second idea is two leads along, so dog pairs with water, play with garden and so on.
const SECONDARY_OFFSET = 2;
// Every other design also gets its second idea as a feature, not only as a tag.
const SECONDARY_EVERY = 2;
// Tree-led designs start two steps along the canopy list, at maximize.
const TREE_CANOPY_OFFSET = 2;
const GARDEN_SEATS = 2;
const LAWN_TABLES = 2;
/**
 * How each garden-led design changes the existing garden, by variant, to match its title and
 * blurb ("Bigger garden", "I moved the garden beds into the sun."). Every other design keeps the
 * garden as it is, so only a few designs in the engagement move or enlarge it.
 */
const GARDEN_CHANGES: readonly IntentFeature[] = [
  { catalogId: 'community-garden', count: 1, size: 'large' },
  { catalogId: 'community-garden', count: 1, placement: { zone: 'south', terrain: 'flat' } },
  { catalogId: 'community-garden', count: 1, size: 'large', placement: { zone: 'east' } },
  { catalogId: 'community-garden', count: 1, placement: { zone: 'south-east', terrain: 'flat' } },
];

/** One generated design before it is solved: what it asks for and how it is labelled. */
export interface GeneratedIntent {
  readonly index: number;
  readonly lead: LeadTag;
  readonly tags: readonly SeedTag[];
  readonly variant: number;
  readonly seed: number;
  readonly intent: Intent;
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index % list.length];
  if (value === undefined) throw new Error('empty option list');
  return value;
}

function leadFeatures(lead: LeadTag, index: number): IntentFeature[] {
  const size = at(SIZES, index);
  const zone = at(ZONES, index);
  const features: Record<LeadTag, IntentFeature[]> = {
    dog: [{ catalogId: 'off-leash-area', count: 1, size, placement: { zone } }],
    play: [
      { catalogId: 'playground-structure', count: 1, placement: { zone, terrain: 'flat' } },
      { catalogId: 'swings', count: 1, placement: { near: 'playground structure' } },
    ],
    water: [
      {
        catalogId: at(['pond', 'rain-garden'], index),
        count: 1,
        size,
        placement: { terrain: 'low' },
      },
    ],
    garden: [{ catalogId: 'bench', count: GARDEN_SEATS, placement: { near: 'community garden' } }],
    trees: [{ category: 'tree', count: EXTRA_TREES + index, placement: { zone } }],
    open: [{ catalogId: 'picnic-table', count: LAWN_TABLES, placement: { near: 'lawn' } }],
  };
  return features[lead];
}

/** Seats for every design, and the garden change for the garden-led ones. */
function supportFeatures(lead: LeadTag, index: number): IntentFeature[] {
  const garden =
    lead === 'garden' ? [at(GARDEN_CHANGES, Math.floor(index / LEAD_TAGS.length))] : [];
  const seats: IntentFeature = {
    catalogId: at(['bench', 'picnic-table', 'bench'], index),
    count: 1 + (index % BENCH_KINDS),
  };
  return [...garden, seats];
}

function tagsFor(lead: LeadTag, pathStyle: PathStyle, secondary: LeadTag): SeedTag[] {
  const tags: SeedTag[] = [lead, secondary];
  return pathStyle === 'loop' ? [...tags, 'paths'] : tags;
}

/**
 * 25 intents that vary the dog area, play, water, trees, canopy and path style. The solver
 * starts from the park as it is, so the existing garden, lawn and cherries stay unless an
 * intent names them: only the garden-led intents move or enlarge the garden.
 */
export function generatedIntents(): GeneratedIntent[] {
  return Array.from({ length: GENERATED_COUNT }, (_, index) => {
    const lead = at(LEAD_TAGS, index);
    const secondary = at(LEAD_TAGS, index + SECONDARY_OFFSET);
    const pathStyle = at(PATH_STYLES, index + Math.floor(index / LEAD_TAGS.length));
    const features = [
      ...leadFeatures(lead, index),
      ...(index % SECONDARY_EVERY === 0 ? leadFeatures(secondary, index + 1) : []),
      ...supportFeatures(lead, index),
    ];
    return {
      index,
      lead,
      tags: tagsFor(lead, pathStyle, secondary),
      variant: Math.floor(index / LEAD_TAGS.length),
      seed: GENERATED_SEED_BASE + index,
      intent: {
        features,
        paths: { style: pathStyle },
        canopy: at(CANOPY, index + (lead === 'trees' ? TREE_CANOPY_OFFSET : 0)),
        character: at(['natural', 'active', 'open-lawn'] as const, index),
      },
    };
  });
}

/** The metrics report when the document breaks no hard rule and names real catalog entries. */
export function submittableReport(
  site: SeedSite,
  document: DesignDocument,
): MetricsReport | undefined {
  if (validateDesignAgainstCatalog(document, catalogIndex).length > 0) return undefined;
  const report = computeMetrics({
    document,
    baseline: site.baseline,
    parameters: site.parameters,
    parcel: site.parcel,
    catalog: catalogIndex,
    heightmap: site.heightmap,
  });
  return report.ok && isSubmittable(report.value) ? report.value : undefined;
}

/** A solved layout with the report the submit check will compute for it. */
export interface SolvedDesign {
  readonly document: DesignDocument;
  readonly report: MetricsReport;
}

function solveOnce(site: SeedSite, intent: Intent, seed: number): DesignDocument | undefined {
  const solved = solveLayout({
    intent,
    parcel: site.parcel,
    heightmap: site.heightmap,
    parameters: site.parameters,
    catalog: catalogIndex,
    baseline: site.baseline,
    zones: [],
    random: createSeededRandom(seed),
  });
  if (!solved.ok) return undefined;
  const { document, notes } = solved.value;
  return { ...document, generated: { intent, seed, notes: [...notes] } };
}

/** A layout that passes every hard rule; when a seed breaks one, the next seed is tried. */
function solveSubmittable(site: SeedSite, intent: Intent, seed: number): SolvedDesign {
  for (let attempt = 0; attempt < MAX_SOLVE_ATTEMPTS; attempt += 1) {
    const document = solveOnce(site, intent, seed + attempt * SEED_STEP);
    const report = document === undefined ? undefined : submittableReport(site, document);
    if (document !== undefined && report !== undefined) return { document, report };
  }
  throw new Error(`No submittable layout for seed ${String(seed)}`);
}

/**
 * Lays out an intent with the core solver, so every seeded design can be submitted. When the
 * layout misses the budget or the canopy target, the intent is tuned (a cheaper path, smaller
 * areas, then planting to the canopy goal) and solved again, keeping the layout that misses
 * fewest targets. The stored intent is the one that was solved.
 */
export function solveIntent(site: SeedSite, intent: Intent, seed: number): SolvedDesign {
  let best = solveSubmittable(site, intent, seed);
  let current: Intent | undefined = nextIntent(intent, best.report);
  while (current !== undefined && missedTargets(best.report) > 0) {
    const tried = solveSubmittable(site, current, seed);
    if (missedTargets(tried.report) <= missedTargets(best.report)) best = tried;
    current = nextIntent(current, tried.report);
  }
  return best;
}
