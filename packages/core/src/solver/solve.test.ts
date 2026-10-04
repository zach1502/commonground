import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import { validateDesignAgainstCatalog } from '../catalog/design-references.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangleParcel,
} from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap, makeRampHeightmap } from '../metrics/heightmap.js';

import { CANNED_INTENTS } from './fixtures/canned-intents.js';
import { intentSchema, type Intent } from './intent.js';
import { solveLayout, type SolveInput } from './solve.js';

const SIZE = 70;
const parcel = rectangleParcel(SIZE, SIZE);
const heightmap = makeRampHeightmap({ width: SIZE, height: SIZE, gradeY: 0.01 });
const noRules = parametersWith({ requiredFeatures: [] });
const [dogPark] = CANNED_INTENTS;

function inputFor(intent: Intent | undefined, patch: Partial<SolveInput> = {}): SolveInput {
  if (intent === undefined) throw new Error('intent');
  return {
    intent,
    parcel,
    heightmap,
    parameters: noRules,
    catalog: catalogIndex,
    baseline: designOf(),
    zones: [],
    random: createSeededRandom(11),
    ...patch,
  };
}

function solved(input: SolveInput) {
  const result = solveLayout(input);
  if (!result.ok) throw new Error(result.error.kind);
  return result.value;
}

describe('solveLayout', () => {
  it('turns the dog park intent into a dog area, a pond, a loop and trees', () => {
    const { document } = solved(inputFor(dogPark));
    const ids = [...document.items, ...document.areas].map((element) => element.catalogId);
    expect(ids).toContain('off-leash-area');
    expect(ids).toContain('pond');
    expect(document.paths).toHaveLength(1);
    expect(document.paths[0]?.points[0]).toEqual(document.paths[0]?.points.at(-1));
    expect(
      document.items.filter((item) => catalogIndex.get(item.catalogId)?.category === 'tree').length,
    ).toBeGreaterThanOrEqual(8);
    expect(document.gradeDelta.cells).toEqual([]);
  });

  it('puts the pond on the low (south) side of a ramp that rises to the north', () => {
    const { document } = solved(inputFor(dogPark));
    const pond = document.areas.find((area) => area.catalogId === 'pond');
    const ys = pond?.polygon.map((point) => point.y) ?? [];
    expect(Math.min(...ys)).toBeLessThan(SIZE / 3);
  });

  it('gives the same document for the same seed and a different one for another seed', () => {
    const first = solved(inputFor(dogPark));
    const again = solved(inputFor(dogPark));
    const other = solved(inputFor(dogPark, { random: createSeededRandom(12) }));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    expect(JSON.stringify(other.document.items)).not.toBe(JSON.stringify(first.document.items));
  });

  it('keeps locked and unlocked baseline elements the intent does not change', () => {
    const baseline = designOf({
      items: [
        { ...itemAt('old-oak', 'garry-oak', 10, 60), locked: true },
        itemAt('old-bench', 'bench', 30, 30),
      ],
    });
    const { document } = solved(inputFor(dogPark, { baseline }));
    expect(document.items).toEqual(expect.arrayContaining(baseline.items));
  });
});

describe('solveLayout repairs and notes', () => {
  it('adds a garden with enough plots when the project needs one', () => {
    const parameters = parametersWith();
    const { document, notes } = solved(inputFor(dogPark, { parameters }));
    const garden = document.areas.find((area) => area.catalogId === 'community-garden');
    const entry = catalogIndex.get('community-garden');
    if (garden === undefined || entry?.geometryKind !== 'area') throw new Error('no garden');
    expect(modulePlotCount(entry, garden.polygon)).toBeGreaterThanOrEqual(20);
    expect(notes).toContain('A community garden was added because the project needs one.');
  });

  it('enlarges a small garden the intent asked for', () => {
    const intent = intentSchema.parse({
      features: [{ catalogId: 'community-garden', count: 1, size: 'small' }],
      paths: { style: 'minimal' },
      canopy: 'keep-existing',
      character: 'natural',
    });
    const { notes } = solved(inputFor(intent, { parameters: parametersWith() }));
    expect(notes).toContain('The community garden was made larger to fit 20 plots.');
  });

  it('explains what did not fit', () => {
    const intent = intentSchema.parse({
      features: [{ catalogId: 'tennis-court', count: 1, size: 'large' }],
      paths: { style: 'minimal' },
      canopy: 'keep-existing',
      character: 'active',
    });
    const small = rectangleParcel(30, 30);
    const { notes } = solved(
      inputFor(intent, { parcel: small, heightmap: makeFlatHeightmap({ width: 30, height: 30 }) }),
    );
    expect(notes).toContain(
      'The tennis court did not fit in the park. Try a smaller size in the editor.',
    );
  });

  it('turns every canned intent into a document the catalog accepts', { timeout: 60_000 }, () => {
    CANNED_INTENTS.forEach((intent) => {
      const { document } = solved(inputFor(intent, { parameters: parametersWith() }));
      expect(validateDesignAgainstCatalog(document, catalogIndex)).toEqual([]);
    });
  });

  it('rejects a heightmap it cannot read and a parcel off the grid', () => {
    const broken = { ...heightmap, elevations: new Float32Array(3) };
    expect(solveLayout(inputFor(dogPark, { heightmap: broken }))).toMatchObject({
      ok: false,
      error: { kind: 'invalidTerrain' },
    });
    const far = makeFlatHeightmap({ width: 10, height: 10, originLocal: { x: 500, y: 500 } });
    expect(solveLayout(inputFor(dogPark, { heightmap: far }))).toMatchObject({
      ok: false,
      error: { kind: 'emptyParcel' },
    });
  });
});
