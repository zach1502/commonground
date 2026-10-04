import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import { BASELINE_MOVED_M } from '../constants.js';
import { parametersWith } from '../metrics/fixtures/design-builders.js';
import { designFootprints } from '../metrics/footprints.js';
import { intersectCount, rasterizePolygon, type Grid } from '../metrics/raster.js';
import type { DesignArea, DesignDocument } from '../schema/design.js';
import { polygonArea } from '../schema/geometry.js';

import {
  BASELINE,
  CHERRY_IDS,
  GARDEN_ID,
  SITE_DEPTH_M,
  SITE_WIDTH_M,
  baselineInput,
  neutralIntent,
} from './fixtures/baseline-site.js';
import { CANNED_INTENTS } from './fixtures/canned-intents.js';
import type { Intent } from './intent.js';
import { solveLayout, type SolveInput } from './solve.js';

const RUNS = 12;
const GRID: Grid = {
  width: SITE_WIDTH_M,
  height: SITE_DEPTH_M,
  cellM: 1,
  originLocal: { x: 0, y: 0 },
};
const NEUTRAL_POOL = ['bench', 'picnic-table', 'swings', 'drinking-fountain', 'pond', 'salal'];
const [dogPark] = CANNED_INTENTS;

function solved(input: SolveInput): DesignDocument {
  const result = solveLayout(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.document;
}

function gardenOf(document: DesignDocument): DesignArea {
  const garden = document.areas.find((area) => area.id === GARDEN_ID);
  if (garden === undefined) throw new Error('the garden is gone');
  return garden;
}

function centreOf(area: DesignArea) {
  const n = area.polygon.length;
  const sum = area.polygon.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / n, y: sum.y / n };
}

function plotsOf(area: DesignArea): number {
  const entry = catalogIndex.get(area.catalogId);
  return entry?.geometryKind === 'area' ? modulePlotCount(entry, area.polygon) : 0;
}

function gardenIntent(feature: Intent['features'][number]): Intent {
  return neutralIntent({ features: [feature], paths: { style: 'minimal' } });
}

const neutralArbitrary = fc.record({
  features: fc.array(
    fc.record({
      catalogId: fc.constantFrom(...NEUTRAL_POOL),
      count: fc.integer({ min: 1, max: 2 }),
    }),
    { maxLength: 3 },
  ),
  paths: fc.record({ style: fc.constantFrom('loop', 'connect-all', 'minimal') }),
  canopy: fc.constantFrom('keep-existing', 'add-some', 'maximize'),
  character: fc.constantFrom('open-lawn', 'natural', 'active'),
});

describe('solveLayout from the baseline', () => {
  it(
    'keeps every baseline item, path and area unchanged for a neutral intent',
    {
      timeout: 120_000,
    },
    () => {
      fc.assert(
        fc.property(neutralArbitrary, fc.integer({ min: 0, max: 1_000_000 }), (intent, seed) => {
          const document = solved(
            baselineInput(neutralIntent(intent), { random: createSeededRandom(seed) }),
          );
          expect(document.items).toEqual(expect.arrayContaining(BASELINE.items));
          expect(document.areas).toEqual(expect.arrayContaining(BASELINE.areas));
          expect(document.paths).toEqual(expect.arrayContaining(BASELINE.paths));
        }),
        { seed: 20260926, numRuns: RUNS },
      );
    },
  );

  it('treats kept footprints as taken, so nothing new covers the garden or the lawn', () => {
    const document = solved(baselineInput(dogPark ?? neutralIntent()));
    const kept = BASELINE.areas.map((area) => rasterizePolygon(GRID, area.polygon));
    const baselineIds = new Set([...BASELINE.items, ...BASELINE.areas].map(({ id }) => id));
    designFootprints({ document, catalog: catalogIndex, grid: GRID })
      .filter((footprint) => footprint.kind !== 'path' && !baselineIds.has(footprint.id))
      .forEach((footprint) => {
        kept.forEach((mask) => {
          expect(intersectCount(footprint.mask, mask)).toBe(0);
        });
      });
  });

  it('counts kept trees toward the canopy target', () => {
    const parameters = parametersWith({
      requiredFeatures: [],
      canopy: { ...parametersWith().canopy, minPercent: 1 },
    });
    const document = solved(baselineInput(neutralIntent({ canopy: 'maximize' }), { parameters }));
    expect(document.items).toHaveLength(BASELINE.items.length);
  });

  it('keeps the garden and cherries while the demo sentence adds a dog area, pond, loop and trees', () => {
    const document = solved(baselineInput(dogPark ?? neutralIntent()));
    const ids = [...document.items, ...document.areas].map((element) => element.catalogId);
    expect(ids).toContain('off-leash-area');
    expect(ids).toContain('pond');
    const loop = document.paths.find((path) => path.id !== 'old-path');
    expect(loop?.points[0]).toEqual(loop?.points.at(-1));
    const trees = document.items.filter(
      (item) => catalogIndex.get(item.catalogId)?.category === 'tree',
    );
    expect(trees.length).toBeGreaterThan(BASELINE.items.length);
    expect(gardenOf(document)).toEqual(BASELINE.areas[0]);
    expect(document.items.map((item) => item.id)).toEqual(expect.arrayContaining([...CHERRY_IDS]));
  });
});

describe('solveLayout changes an existing feature only when asked', () => {
  it('removes the garden for "no garden"', () => {
    const intent = gardenIntent({ catalogId: 'community-garden', count: 0 });
    const document = solved(baselineInput(intent));
    expect(document.areas.some((area) => area.catalogId === 'community-garden')).toBe(false);
  });

  it('moves the garden to the north side, keeping its id and size', () => {
    const before = BASELINE.areas[0];
    if (before === undefined) throw new Error('baseline garden');
    const intent = gardenIntent({
      catalogId: 'community-garden',
      count: 1,
      placement: { zone: 'north' },
    });
    const after = gardenOf(solved(baselineInput(intent)));
    const centre = centreOf(after);
    expect(centre.x).toBeGreaterThan(SITE_WIDTH_M / 3);
    expect(centre.x).toBeLessThan((SITE_WIDTH_M * 2) / 3);
    expect(centre.y).toBeGreaterThan((SITE_DEPTH_M * 2) / 3);
    const shift = Math.hypot(centre.x - centreOf(before).x, centre.y - centreOf(before).y);
    expect(shift).toBeGreaterThan(BASELINE_MOVED_M);
    expect(polygonArea(after.polygon)).toBeCloseTo(polygonArea(before.polygon), -1);
  });

  it('enlarges the garden for "a bigger garden"', () => {
    const before = BASELINE.areas[0];
    if (before === undefined) throw new Error('baseline garden');
    const intent = gardenIntent({ catalogId: 'community-garden', count: 1, size: 'large' });
    const after = gardenOf(solved(baselineInput(intent)));
    expect(polygonArea(after.polygon)).toBeGreaterThan(polygonArea(before.polygon) * 1.4);
    expect(plotsOf(after)).toBeGreaterThan(plotsOf(before));
  });

  it('leaves the garden where it is when it already meets the placement asked for', () => {
    const intent = gardenIntent({
      catalogId: 'community-garden',
      count: 1,
      placement: { zone: 'north-east' },
    });
    expect(gardenOf(solved(baselineInput(intent)))).toEqual(BASELINE.areas[0]);
  });
});
