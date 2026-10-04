import { describe, expect, it } from 'vitest';

import { designDocumentSchema, type DesignDocument } from '@parkshape/core';

import { loadSeedComments, planSeedComments, type CommentedDesign } from './comments.js';
import { seedPeople } from './personas.js';

const SEED_COMMENTS = 6;

/** A stored document with the given parts, parsed so the ids and metres carry their brands. */
function documentWith(parts: Record<string, unknown>): DesignDocument {
  return designDocumentSchema.parse({
    version: 1,
    items: [],
    paths: [],
    areas: [],
    gradeDelta: { cells: [] },
    zones: [],
    ...parts,
  });
}

const point = { x: 10, y: 10 };
const ring = [point, { x: 20, y: 10 }, { x: 20, y: 20 }];

const cedar = documentWith({
  items: [
    { id: 'gen-1', catalogId: 'bench', position: point, rotationDeg: 0, locked: false },
    {
      id: 'gen-19',
      catalogId: 'western-red-cedar',
      position: point,
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [{ id: 'gen-5', surface: 'gravel', widthM: 2, points: [point, { x: 30, y: 10 }] }],
});

const garden = documentWith({
  items: [
    { id: 'gen-1', catalogId: 'picnic-table', position: point, rotationDeg: 0, locked: false },
    { id: 'tree-1', catalogId: 'flowering-cherry', position: point, rotationDeg: 0, locked: true },
  ],
  areas: [{ id: 'plots', catalogId: 'community-garden', polygon: ring, locked: false }],
});

const { residents } = seedPeople();

function designs(): CommentedDesign[] {
  return [
    { id: 'd-cedar', title: 'Cedar shade walk', authorId: residents[0]?.id ?? '', document: cedar },
    {
      id: 'd-garden',
      title: 'Garden by the lane',
      authorId: residents[1]?.id ?? '',
      document: garden,
    },
  ];
}

describe('planSeedComments', () => {
  const planned = planSeedComments(loadSeedComments(), { designs: designs(), residents });

  it('puts about six comments on two designs', () => {
    expect(planned).toHaveLength(SEED_COMMENTS);
    expect(new Set(planned.map(({ designId }) => designId))).toEqual(
      new Set(['d-cedar', 'd-garden']),
    );
  });

  it('anchors each comment on an element the design has, of every kind', () => {
    expect(planned.map(({ designId, elementId }) => `${designId}/${elementId}`)).toEqual([
      'd-cedar/gen-1',
      'd-cedar/gen-5',
      'd-cedar/gen-19',
      'd-garden/gen-1',
      'd-garden/plots',
      'd-garden/tree-1',
    ]);
  });

  it('never has a design author comment on their own design', () => {
    const authors = new Map(designs().map((design) => [design.id, design.authorId]));
    expect(planned.every(({ designId, authorId }) => authors.get(designId) !== authorId)).toBe(
      true,
    );
  });

  it('fails loudly when a named design or element is missing', () => {
    const [first] = designs();
    expect(() =>
      planSeedComments(loadSeedComments(), {
        designs: first === undefined ? [] : [first],
        residents,
      }),
    ).toThrow('Garden by the lane');
    const bare = designs().map((design) => ({ ...design, document: documentWith({}) }));
    expect(() => planSeedComments(loadSeedComments(), { designs: bare, residents })).toThrow(
      'bench',
    );
  });
});
