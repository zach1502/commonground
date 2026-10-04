import { describe, expect, it } from 'vitest';

import {
  catalogIndex,
  createSeededRandom,
  defaultParameters,
  designDocumentSchema,
  makeFlatHeightmap,
  parcelSchema,
  solveLayout,
  validateDesignAgainstCatalog,
} from '@parkshape/core';

import { sourcedSchema } from '../../answer-source.js';
import { contentProblems } from '../../filter.js';
import { intentSchema, type Intent, type IntentFeature } from '../../schema/intent.js';
import type { IntentProvider } from '../intent-provider.js';

export const DOG_PARK_SENTENCE =
  'a dog park in the back corner, a pond on the low side, a loop path, lots of trees';

/** Ten resident descriptions every provider must turn into a valid intent. */
export const CANNED_SENTENCES = [
  DOG_PARK_SENTENCE,
  'two benches near the playground and a drinking fountain',
  'keep it natural with a meadow and native shrubs along the edge',
  'a big community garden on the flat part in the north-west',
  'a basketball court away from the houses',
  'open lawn in the centre with a few picnic tables',
  'minimal gravel paths and some new trees',
  'a small spray pad and swings for the kids',
  'connect everything with a paved path, add lights and a washroom',
  'more trees for shade on the high ground',
] as const;

function isDogArea(feature: IntentFeature): boolean {
  return feature.category === 'dog' || feature.catalogId === 'off-leash-area';
}

function isPond(feature: IntentFeature): boolean {
  return feature.catalogId === 'pond' || feature.category === 'water';
}

function placeNames(intent: Intent): string[] {
  return intent.features.flatMap(({ placement }) =>
    [placement?.near, placement?.awayFrom].filter((name) => name !== undefined),
  );
}

const SOLVER_SIDE_M = 60;
const SOLVER_SEED = 7;
const solverParcel = parcelSchema.parse({
  id: 'contract-parcel',
  name: 'Contract parcel',
  polygon: [
    { x: 0, y: 0 },
    { x: SOLVER_SIDE_M, y: 0 },
    { x: SOLVER_SIDE_M, y: SOLVER_SIDE_M },
    { x: 0, y: SOLVER_SIDE_M },
  ],
  origin: { lat: 49.2636, lon: -123.0995 },
});
const emptyBaseline = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

/** The layout solver's draft for an intent, checked against the catalog. */
function catalogIssuesOfLayout(intent: Intent): unknown[] {
  const result = solveLayout({
    intent,
    parcel: solverParcel,
    heightmap: makeFlatHeightmap({ width: SOLVER_SIDE_M, height: SOLVER_SIDE_M }),
    parameters: defaultParameters(),
    catalog: catalogIndex,
    baseline: emptyBaseline,
    zones: [],
    random: createSeededRandom(SOLVER_SEED),
  });
  return result.ok
    ? validateDesignAgainstCatalog(result.value.document, catalogIndex)
    : [result.error];
}

/** Behaviour every IntentProvider adapter must have. Each adapter test calls this with a factory. */
export function intentProviderContract(name: string, makeProvider: () => IntentProvider): void {
  const parse = async (text: string) => (await makeProvider().parse(text)).value;

  describe(`${name} meets the IntentProvider contract`, () => {
    it('says who read the description: the fixed rules, or a model it names', async () => {
      const answer = await makeProvider().parse(DOG_PARK_SENTENCE);
      expect(sourcedSchema(intentSchema).safeParse(answer).success).toBe(true);
    });

    it.each(CANNED_SENTENCES)('returns a valid intent for "%s"', async (sentence) => {
      const intent = await parse(sentence);
      expect(intentSchema.safeParse(intent).success).toBe(true);
      expect(placeNames(intent).flatMap(contentProblems)).toEqual([]);
    });

    it('reads the dog park sentence as a dog area at the back and a pond on low ground', async () => {
      const intent = await parse(DOG_PARK_SENTENCE);
      const dog = intent.features.find(isDogArea);
      expect(['south-east', 'south']).toContain(dog?.placement?.zone);
      expect(intent.features.find(isPond)?.placement?.terrain).toBe('low');
      expect(intent.paths.style).toBe('loop');
      expect(intent.canopy).toBe('maximize');
    });

    it(
      'gives intents the layout solver turns into catalog-valid drafts',
      { timeout: 60_000 },
      async () => {
        const intents = await Promise.all(CANNED_SENTENCES.map((text) => parse(text)));
        expect(intents.flatMap(catalogIssuesOfLayout)).toEqual([]);
      },
    );

    it('returns a valid intent for text it cannot read', async () => {
      const intent = await parse('hello there');
      expect(intentSchema.safeParse(intent).success).toBe(true);
    });
  });
}
