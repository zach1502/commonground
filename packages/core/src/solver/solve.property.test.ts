import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { catalogIndex } from '../catalog/catalog.js';
import { computeMetrics } from '../metrics/compute.js';
import {
  designOf,
  parametersWith,
  rectangle,
  rectangleParcel,
} from '../metrics/fixtures/design-builders.js';
import { designFootprints } from '../metrics/footprints.js';
import { makeRampHeightmap } from '../metrics/heightmap.js';
import { intersectCount, rasterizePolygon } from '../metrics/raster.js';
import { lockedOverlaps } from '../metrics/zones.js';
import { zoneSchema } from '../schema/design.js';

import { intentSchema } from './intent.js';
import { solveLayout, type SolveInput } from './solve.js';

const SIZE = 36;
const RUNS = 15;
const parcel = rectangleParcel(SIZE, SIZE);
const heightmap = makeRampHeightmap({ width: SIZE, height: SIZE, gradeX: 0.015, gradeY: 0.01 });
const pool = ['bench', 'picnic-table', 'swings', 'drinking-fountain', 'pond', 'lawn', 'salal'];

const featureArbitrary = fc.record({
  catalogId: fc.constantFrom(...pool),
  count: fc.integer({ min: 1, max: 3 }),
  size: fc.constantFrom('small', 'medium'),
  placement: fc.record(
    {
      zone: fc.constantFrom('north', 'south-east', 'centre', 'west'),
      terrain: fc.constantFrom('flat', 'low', 'high', 'edge'),
    },
    { requiredKeys: [] },
  ),
});

const intentArbitrary = fc
  .record({
    features: fc.array(featureArbitrary, { maxLength: 4 }),
    paths: fc.record({ style: fc.constantFrom('loop', 'connect-all', 'minimal') }),
    canopy: fc.constantFrom('keep-existing', 'add-some', 'maximize'),
    character: fc.constantFrom('open-lawn', 'natural', 'active'),
  })
  .map((intent) => intentSchema.parse(intent));

const caseArbitrary = fc.record({
  intent: intentArbitrary,
  zone: fc.record({ x: fc.integer({ min: 0, max: 28 }), y: fc.integer({ min: 0, max: 28 }) }),
  tree: fc.record({ x: fc.integer({ min: 2, max: 34 }), y: fc.integer({ min: 2, max: 34 }) }),
  seed: fc.integer({ min: 0, max: 1_000_000 }),
  needsGarden: fc.constantFrom('yes', 'no'),
});

type Case = typeof caseArbitrary extends fc.Arbitrary<infer T> ? T : never;

function inputFor(sample: Case): SolveInput {
  const { zone, tree } = sample;
  const forbidden = zoneSchema.parse({
    id: 'zone-1',
    kind: 'forbidden',
    polygon: rectangle(zone.x, zone.y, zone.x + 6, zone.y + 6),
    label: 'Utility line',
  });
  const baseline = designOf({
    items: [
      {
        id: 'old-tree',
        catalogId: 'garry-oak',
        position: tree,
        rotationDeg: 0,
        locked: true,
        dbhCm: 20,
      },
    ],
  });
  const requiredFeatures =
    sample.needsGarden === 'yes' ? [{ category: 'garden' as const, minCount: 1, minPlots: 6 }] : [];
  return {
    intent: sample.intent,
    parcel,
    heightmap,
    parameters: parametersWith({ requiredFeatures, forbiddenZones: [forbidden] }),
    catalog: catalogIndex,
    baseline,
    zones: [],
    random: createSeededRandom(sample.seed),
  };
}

function solved(input: SolveInput) {
  const result = solveLayout(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value.document;
}

describe('solveLayout properties', () => {
  it(
    'keeps every new element in the parcel, out of forbidden zones and off locked footprints',
    { timeout: 60_000 },
    () => {
      fc.assert(
        fc.property(caseArbitrary, (sample) => {
          const input = inputFor(sample);
          const document = solved(input);
          const grid = { width: SIZE, height: SIZE, cellM: 1, originLocal: { x: 0, y: 0 } };
          const parcelMask = rasterizePolygon(grid, parcel.polygon);
          const forbidden = rasterizePolygon(
            grid,
            input.parameters.forbiddenZones[0]?.polygon ?? [],
          );
          const footprints = designFootprints({ document, catalog: catalogIndex, grid });
          footprints
            .filter((footprint) => !footprint.locked && footprint.kind !== 'path')
            .forEach((footprint) => {
              expect(intersectCount(footprint.mask, parcelMask)).toBe(
                footprint.mask.cells.reduce((total, cell) => total + cell, 0),
              );
            });
          footprints
            .filter((footprint) => !footprint.locked)
            .forEach((footprint) => {
              expect(intersectCount(footprint.mask, forbidden)).toBe(0);
            });
          expect(lockedOverlaps(footprints)).toEqual([]);
          expect(document.gradeDelta.cells).toEqual([]);
        }),
        { seed: 20260925, numRuns: RUNS },
      );
    },
  );
});

describe('solveLayout properties after repair and per seed', () => {
  it('meets the garden rule after repair when the project needs one', { timeout: 60_000 }, () => {
    fc.assert(
      fc.property(caseArbitrary, (sample) => {
        const input = inputFor({ ...sample, needsGarden: 'yes' });
        const document = solved(input);
        const report = computeMetrics({ ...input, document });
        expect(report.ok && report.value.constraints.requiredFeatures.status).toBe('ok');
      }),
      { seed: 20260926, numRuns: RUNS },
    );
  });

  it(
    'gives identical output for one seed and different item positions for another',
    { timeout: 60_000 },
    () => {
      fc.assert(
        fc.property(caseArbitrary, (sample) => {
          const first = solved(inputFor(sample));
          const again = solved(inputFor(sample));
          const other = solved(inputFor({ ...sample, seed: sample.seed + 1 }));
          expect(JSON.stringify(again)).toBe(JSON.stringify(first));
          const positions = (document: typeof first) =>
            JSON.stringify(
              document.items.filter((item) => !item.locked).map((item) => item.position),
            );
          const hasNewItems = first.items.some((item) => !item.locked);
          if (hasNewItems) expect(positions(other)).not.toBe(positions(first));
        }),
        { seed: 20260927, numRuns: RUNS },
      );
    },
  );
});
