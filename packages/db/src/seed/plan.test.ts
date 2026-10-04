import { beforeAll, describe, expect, it } from 'vitest';

import {
  catalogIndex,
  computeMetrics,
  intentSchema,
  isSubmittable,
  validateDesignAgainstCatalog,
} from '@parkshape/core';

import { LEAD_TAGS } from './fragments.js';
import { GENERATED_COUNT, generatedIntents } from './generated.js';
import { loadJonathanRogersSite } from './jonathan-rogers.js';
import { buildSeedPlan, type BuiltDesign, type PlannedDesign } from './plan.js';
import { DRAFT_BLURB } from './showcase.js';

const SHOWCASE_COUNT = 5;
const PATH_STYLE_COUNT = 3;
const CANOPY_COUNT = 3;
// About 30 layouts at 1 to 2 s each on the 176 m by 86 m parcel, slower under coverage.
const SOLVE_TIMEOUT_MS = 600_000;
// The seed should read like a real engagement: most designs meet the budget and canopy targets.
const SEED_TARGETS = ['budget', 'canopy'] as const;
const MAX_BADGED_DESIGNS = 3;
const MAX_BUDGET_SHARE = 1.25;
// Only the garden-led designs, and the showcase designs that place the garden, change it.
const MIN_GARDEN_CHANGES = 3;
const GARDEN_LED_COUNT = 4;
const MAX_GARDEN_CHANGES = 8;

/** At most 3 designs miss the budget or canopy target, and none costs over 125% of the budget. */
function expectFewTargetBadges(
  site: ReturnType<typeof loadJonathanRogersSite>,
  built: readonly BuiltDesign[],
) {
  const reports = built.map((design) => {
    const report = computeMetrics({
      document: design.document,
      parameters: site.parameters,
      parcel: site.parcel,
      catalog: catalogIndex,
      heightmap: site.heightmap,
    });
    if (!report.ok) throw new Error(JSON.stringify(report.error));
    return report.value;
  });
  const badged = reports.filter((report) =>
    SEED_TARGETS.some((key) => report.constraints[key].status !== 'ok'),
  );
  expect(badged.length).toBeLessThanOrEqual(MAX_BADGED_DESIGNS);
  const limit = site.parameters.budget.totalCad * MAX_BUDGET_SHARE;
  for (const report of reports) expect(report.totals.costCad).toBeLessThanOrEqual(limit);
}

/** The garden, lawn and unlocked cherries survive; only a few designs move or resize the garden. */
function expectGardenKept(
  site: ReturnType<typeof loadJonathanRogersSite>,
  built: readonly (BuiltDesign & PlannedDesign)[],
) {
  const baselineArea = (catalogId: string) => {
    const area = site.baseline.areas.find((found) => found.catalogId === catalogId);
    if (area === undefined) throw new Error(`no baseline ${catalogId}`);
    return area;
  };
  const garden = baselineArea('community-garden');
  const lawn = baselineArea('lawn');
  const cherries = site.baseline.items.filter((item) => !item.locked);
  const changed = built.filter(({ document }) => {
    const after = document.areas.find((area) => area.id === garden.id);
    expect(after, 'the garden stays in every design').toBeDefined();
    expect(document.areas.map((area) => area.id)).toContain(lawn.id);
    expect(document.items).toEqual(expect.arrayContaining(cherries));
    return JSON.stringify(after?.polygon) !== JSON.stringify(garden.polygon);
  });
  expect(changed.length).toBeGreaterThanOrEqual(MIN_GARDEN_CHANGES);
  expect(changed.length).toBeLessThanOrEqual(MAX_GARDEN_CHANGES);
  const leads = changed.filter(({ kind }) => kind === 'generated').map(({ tags }) => tags[0]);
  expect(new Set(leads)).toEqual(new Set(['garden']));
}

describe('generated intents', () => {
  const intents = generatedIntents();

  it('makes 25 valid intents that vary every idea, canopy choice and path style', () => {
    expect(intents).toHaveLength(GENERATED_COUNT);
    for (const { intent } of intents) expect(intentSchema.parse(intent)).toEqual(intent);
    expect(new Set(intents.map(({ lead }) => lead))).toEqual(new Set(LEAD_TAGS));
    expect(new Set(intents.map(({ intent }) => intent.paths.style)).size).toBe(PATH_STYLE_COUNT);
    expect(new Set(intents.map(({ intent }) => intent.canopy)).size).toBe(CANOPY_COUNT);
    expect(new Set(intents.map(({ seed }) => seed)).size).toBe(GENERATED_COUNT);
  });

  it('names the existing garden only in the garden-led intents, and never removes it', () => {
    const naming = intents.filter(({ intent }) =>
      intent.features.some((feature) => feature.catalogId === 'community-garden'),
    );
    expect(naming.map(({ lead }) => lead)).toEqual(Array(GARDEN_LED_COUNT).fill('garden'));
    for (const { intent } of intents) {
      expect(intent.features.every((feature) => feature.count > 0)).toBe(true);
    }
  });
});

const site = loadJonathanRogersSite();
let built: (BuiltDesign & PlannedDesign)[] = [];

// Solving is the slow part, so every block shares one pass over the plan.
function buildOnce() {
  if (built.length === 0) {
    built = buildSeedPlan(site).designs.map((design) => ({ ...design, ...design.build() }));
  }
}

describe('buildSeedPlan', () => {
  beforeAll(buildOnce, SOLVE_TIMEOUT_MS);

  it(
    'solves 30 designs that each pass the catalog check and every hard rule',
    () => {
      expect(built).toHaveLength(SHOWCASE_COUNT + GENERATED_COUNT);
      for (const design of built) {
        expect(validateDesignAgainstCatalog(design.document, catalogIndex), design.title).toEqual(
          [],
        );
        const report = computeMetrics({
          document: design.document,
          parameters: site.parameters,
          parcel: site.parcel,
          catalog: catalogIndex,
          heightmap: site.heightmap,
        });
        expect(report.ok && isSubmittable(report.value), design.title).toBe(true);
      }
    },
    SOLVE_TIMEOUT_MS,
  );

  it('keeps budget and canopy badges to a few designs', { timeout: SOLVE_TIMEOUT_MS }, () => {
    expectFewTargetBadges(site, built);
  });

  it('gives each design its own author and natural key, and marks the draft blurbs', () => {
    expect(new Set(built.map(({ author }) => author.id)).size).toBe(built.length);
    expect(new Set(built.map(({ key }) => key)).size).toBe(built.length);
    const showcase = built.filter(({ kind }) => kind === 'showcase');
    expect(showcase.map(({ blurb }) => blurb)).toEqual(Array(SHOWCASE_COUNT).fill(DRAFT_BLURB));
  });

  it('gives generated designs unique titles and a two-sentence blurb from the fragments', () => {
    const generated = built.filter(({ kind }) => kind === 'generated');
    expect(new Set(generated.map(({ title }) => title)).size).toBe(GENERATED_COUNT);
    for (const { blurb } of generated) expect(blurb).toMatch(/^I .+\. .+\d.*\.$/);
  });

  it(
    'keeps the solver seed in each document and solves the same layout on a new plan',
    () => {
      for (const { document } of built) expect(document.generated?.seed).toBeTypeOf('number');
      const [again] = buildSeedPlan(site, { generatedCount: 0 }).designs;
      expect(again?.build().document).toEqual(built[0]?.document);
    },
    SOLVE_TIMEOUT_MS,
  );
});

describe('buildSeedPlan and the park as it is', () => {
  beforeAll(buildOnce, SOLVE_TIMEOUT_MS);

  it('keeps the existing garden, lawn and cherries, and changes the garden only when asked', () => {
    expectGardenKept(site, built);
  });
});
