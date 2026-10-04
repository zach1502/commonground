import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { designDocumentSchema, type DesignDocumentInput } from './design.js';

type PolygonInput = DesignDocumentInput['areas'][number]['polygon'];

const triangle: PolygonInput = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
];

const document: DesignDocumentInput = {
  version: 1,
  items: [
    { id: 'i1', catalogId: 'bench', position: { x: 5, y: 5 }, rotationDeg: 90, locked: false },
    {
      id: 'i2',
      catalogId: 'garry-oak',
      position: { x: 8, y: 2 },
      rotationDeg: 0,
      locked: true,
      scaleJitter: 1.05,
    },
  ],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    },
  ],
  areas: [{ id: 'a1', catalogId: 'lawn', polygon: triangle, locked: false }],
  gradeDelta: { cells: [{ x: 3, y: 4, deltaM: -0.5 }] },
  zones: [{ id: 'z1', kind: 'forbidden', polygon: triangle, label: 'Utility corridor' }],
};

const withItem = (patch: Record<string, unknown>) => ({
  ...document,
  items: [{ ...document.items[0], ...patch }],
});

describe('designDocumentSchema', () => {
  it('round-trips a document through JSON', () => {
    const parsed = designDocumentSchema.parse(document);
    expect(designDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(parsed).toEqual(document);
  });

  it('rejects any version other than 1', () => {
    expect(designDocumentSchema.safeParse({ ...document, version: 2 }).success).toBe(false);
  });

  it('rejects rotations outside 0 to under 360 degrees', () => {
    expect(designDocumentSchema.safeParse(withItem({ rotationDeg: 360 })).success).toBe(false);
    expect(designDocumentSchema.safeParse(withItem({ rotationDeg: -1 })).success).toBe(false);
    expect(designDocumentSchema.safeParse(withItem({ rotationDeg: 359.9 })).success).toBe(true);
  });

  it('rejects scale jitter outside 0.9 to 1.1', () => {
    expect(designDocumentSchema.safeParse(withItem({ scaleJitter: 0.89 })).success).toBe(false);
    expect(designDocumentSchema.safeParse(withItem({ scaleJitter: 1.11 })).success).toBe(false);
  });

  it('accepts an optional positive trunk diameter on items', () => {
    expect(designDocumentSchema.safeParse(withItem({ dbhCm: 45 })).success).toBe(true);
    expect(designDocumentSchema.safeParse(withItem({ dbhCm: 0 })).success).toBe(false);
  });

  it('rejects a path with a negative width or a single point', () => {
    const path = document.paths[0];
    expect(
      designDocumentSchema.safeParse({ ...document, paths: [{ ...path, widthM: -2 }] }).success,
    ).toBe(false);
    expect(
      designDocumentSchema.safeParse({
        ...document,
        paths: [{ ...path, points: [{ x: 0, y: 0 }] }],
      }).success,
    ).toBe(false);
  });

  it('rejects an area polygon with fewer than 3 points', () => {
    const area = { ...document.areas[0], polygon: triangle.slice(0, 2) };
    expect(designDocumentSchema.safeParse({ ...document, areas: [area] }).success).toBe(false);
  });

  it('rejects grade cells off the integer grid and unknown fields', () => {
    const gradeDelta = { cells: [{ x: 0.5, y: 1, deltaM: 1 }] };
    expect(designDocumentSchema.safeParse({ ...document, gradeDelta }).success).toBe(false);
    expect(designDocumentSchema.safeParse({ ...document, extra: 1 }).success).toBe(false);
  });

  it('does not check catalog ids', () => {
    expect(designDocumentSchema.safeParse(withItem({ catalogId: 'no-such-item' })).success).toBe(
      true,
    );
  });
});

const coordinate = fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true });
const localPoint = fc.record({ x: coordinate, y: coordinate });
const elementId = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
const catalogId = fc.constantFrom('bench', 'garry-oak', 'lawn', 'pond');
const arbitraryDocument = fc.record({
  version: fc.constant(1 as const),
  items: fc.array(
    fc.record(
      {
        id: elementId,
        catalogId,
        position: localPoint,
        rotationDeg: fc.double({ min: 0, max: 359.99, noNaN: true }),
        locked: fc.boolean(),
        scaleJitter: fc.double({ min: 0.9, max: 1.1, noNaN: true }),
      },
      { requiredKeys: ['id', 'catalogId', 'position', 'rotationDeg', 'locked'] },
    ),
    { maxLength: 8 },
  ),
  paths: fc.array(
    fc.record({
      id: elementId,
      surface: fc.constantFrom('asphalt', 'gravel', 'boardwalk'),
      widthM: fc.double({ min: 0.5, max: 6, noNaN: true }),
      points: fc.array(localPoint, { minLength: 2, maxLength: 6 }),
    }),
    { maxLength: 3 },
  ),
  areas: fc.array(
    fc.record({
      id: elementId,
      catalogId,
      polygon: fc.array(localPoint, { minLength: 3, maxLength: 6 }),
      locked: fc.boolean(),
    }),
    { maxLength: 3 },
  ),
  gradeDelta: fc.record({
    cells: fc.array(
      fc.record({
        x: fc.integer({ min: 0, max: 200 }),
        y: fc.integer({ min: 0, max: 200 }),
        deltaM: fc.double({ min: -5, max: 5, noNaN: true }),
      }),
      { maxLength: 10 },
    ),
  }),
  zones: fc.array(
    fc.record({
      id: elementId,
      kind: fc.constantFrom('forbidden', 'noGrade'),
      polygon: fc.array(localPoint, { minLength: 3, maxLength: 5 }),
      label: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { maxLength: 2 },
  ),
});

describe('recorded plots on areas', () => {
  it('round-trips the recorded plot count of an existing garden', () => {
    const garden = { ...document.areas[0], catalogId: 'community-garden', recordedPlots: 56 };
    const parsed = designDocumentSchema.parse({ ...document, areas: [garden] });
    expect(designDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(parsed.areas[0]?.recordedPlots).toBe(56);
  });

  it('rejects a recorded plot count that is not a positive whole number', () => {
    const withPlots = (recordedPlots: number) => ({
      ...document,
      areas: [{ ...document.areas[0], recordedPlots }],
    });
    expect(designDocumentSchema.safeParse(withPlots(0)).success).toBe(false);
    expect(designDocumentSchema.safeParse(withPlots(2.5)).success).toBe(false);
  });
});

describe('designDocumentSchema properties', () => {
  it('parses every generated document and survives a JSON round trip', () => {
    fc.assert(
      fc.property(arbitraryDocument, (candidate) => {
        const parsed = designDocumentSchema.parse(candidate);
        // -0 becomes 0 in JSON, so compare the JSON forms.
        const again = designDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)));
        expect(JSON.stringify(again)).toBe(JSON.stringify(parsed));
      }),
      { seed: 20260925, numRuns: 200 },
    );
  });
});

describe('generated starting point', () => {
  const generated = {
    intent: { features: [], paths: { style: 'loop' }, canopy: 'maximize', character: 'natural' },
    seed: 7,
    notes: ['The pond did not fit on the low side. It is near the south edge instead.'],
  };

  it('keeps the intent, seed and notes a generated draft came from', () => {
    const parsed = designDocumentSchema.parse({ ...document, generated });
    expect(parsed.generated?.seed).toBe(7);
    expect(parsed.generated?.notes).toHaveLength(1);
  });

  it('leaves the field out of hand-made designs', () => {
    expect(designDocumentSchema.parse(document).generated).toBeUndefined();
  });

  it('rejects a negative or fractional seed', () => {
    const negative = { ...document, generated: { ...generated, seed: -1 } };
    const fractional = { ...document, generated: { ...generated, seed: 1.5 } };
    expect(designDocumentSchema.safeParse(negative).success).toBe(false);
    expect(designDocumentSchema.safeParse(fractional).success).toBe(false);
  });

  it('keeps who read the description, and accepts drafts made before it was kept', () => {
    const byModel = { ...generated, source: 'model', model: 'gemini-3.5-flash-lite' };
    expect(designDocumentSchema.parse({ ...document, generated: byModel }).generated).toMatchObject(
      { source: 'model', model: 'gemini-3.5-flash-lite' },
    );
    const byRules = { ...document, generated: { ...generated, source: 'rule-based' } };
    expect(designDocumentSchema.parse(byRules).generated?.source).toBe('rule-based');
    expect(
      designDocumentSchema.parse({ ...document, generated }).generated?.source,
    ).toBeUndefined();
  });

  it('rejects an unknown source or an empty model name', () => {
    const unknown = { ...document, generated: { ...generated, source: 'person' } };
    const unnamed = { ...document, generated: { ...generated, source: 'model', model: '' } };
    expect(designDocumentSchema.safeParse(unknown).success).toBe(false);
    expect(designDocumentSchema.safeParse(unnamed).success).toBe(false);
  });
});
