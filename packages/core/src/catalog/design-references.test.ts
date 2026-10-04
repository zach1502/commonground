import { describe, expect, it } from 'vitest';

import { designDocumentSchema, type DesignDocumentInput } from '../schema/design.js';

import { catalogIndex } from './catalog.js';
import { validateDesignAgainstCatalog } from './design-references.js';

type PolygonInput = DesignDocumentInput['areas'][number]['polygon'];

const square: PolygonInput = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const bench = {
  id: 'b1',
  catalogId: 'bench',
  position: { x: 1, y: 1 },
  rotationDeg: 0,
  locked: false,
};
const lawn = { id: 'a1', catalogId: 'lawn', polygon: square, locked: false };
const zone = { id: 'z1', kind: 'noGrade' as const, polygon: square, label: 'Root zone' };

const base: DesignDocumentInput = {
  version: 1,
  items: [bench],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
    },
  ],
  areas: [lawn],
  gradeDelta: { cells: [] },
  zones: [zone],
};

const check = (input: DesignDocumentInput) =>
  validateDesignAgainstCatalog(designDocumentSchema.parse(input), catalogIndex);

describe('validateDesignAgainstCatalog', () => {
  it('returns no issues for a document whose references resolve', () => {
    expect(check(base)).toEqual([]);
  });

  it('reports an unknown catalog id on an item and on an area', () => {
    const items = [{ ...bench, id: 'x1', catalogId: 'hot-tub' }];
    const areas = [{ ...lawn, id: 'x2', catalogId: 'moat' }];
    expect(check({ ...base, items, areas })).toEqual([
      { kind: 'unknownCatalogId', elementId: 'x1', catalogId: 'hot-tub' },
      { kind: 'unknownCatalogId', elementId: 'x2', catalogId: 'moat' },
    ]);
  });

  it('reports an item that names an area catalog entry and the reverse', () => {
    const items = [{ ...bench, catalogId: 'lawn' }];
    const areas = [{ ...lawn, catalogId: 'bench' }];
    expect(check({ ...base, items, areas })).toEqual([
      {
        kind: 'wrongGeometryKind',
        elementId: 'b1',
        catalogId: 'lawn',
        expected: 'point',
        actual: 'area',
      },
      {
        kind: 'wrongGeometryKind',
        elementId: 'a1',
        catalogId: 'bench',
        expected: 'area',
        actual: 'point',
      },
    ]);
  });

  it('reports an element id used twice across items, paths, areas and zones', () => {
    const zones = [{ ...zone, id: 'b1' }];
    expect(check({ ...base, zones })).toEqual([{ kind: 'duplicateElementId', elementId: 'b1' }]);
  });
});
