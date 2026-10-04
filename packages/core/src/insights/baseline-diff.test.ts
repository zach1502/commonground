import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import {
  designOf,
  itemAt,
  rectangle,
  type DesignParts,
  type PathInput,
} from '../metrics/fixtures/design-builders.js';

import { baselineDiff, siteSection } from './baseline-diff.js';
import { syntheticDesign } from './fixtures.js';

const oak = { ...itemAt('oak', 'garry-oak', 10, 10), locked: true };
const garden = {
  id: 'garden',
  catalogId: 'community-garden',
  polygon: rectangle(0, 0, 10, 10),
  locked: false,
};
const trail: PathInput = {
  id: 'trail',
  surface: 'gravel',
  widthM: 2,
  points: [
    { x: 0, y: 20 },
    { x: 20, y: 20 },
  ],
};
// A 30 m square site from the origin, split into thirds for the where label.
const grid = { width: 30, height: 30, cellM: 1, originLocal: { x: 0, y: 0 } };
const baseline = designOf({ items: [oak], areas: [garden], paths: [trail] });

const designs = [
  // Keeps everything in place.
  syntheticDesign({ id: 'same', parts: { items: [oak], areas: [garden], paths: [trail] } }),
  // Moves the oak 0.9 m (not moved), grows the garden 5 percent (not resized), drops the trail.
  syntheticDesign({
    id: 'small-changes',
    parts: {
      items: [{ ...oak, position: { x: 10.9, y: 10 } }],
      areas: [{ ...garden, polygon: rectangle(0, 0, 10.5, 10) }],
    },
  }),
  // Moves the oak 3 m, grows the garden 20 percent in place, shifts the trail 2 m north.
  syntheticDesign({
    id: 'big-changes',
    parts: {
      items: [{ ...oak, position: { x: 13, y: 10 } }],
      areas: [{ ...garden, polygon: rectangle(0, 0, 12, 10) }],
      paths: [
        {
          ...trail,
          points: [
            { x: 0, y: 22 },
            { x: 20, y: 22 },
          ],
        },
      ],
    },
  }),
  // Removes everything.
  syntheticDesign({ id: 'cleared' }),
];

describe('baselineDiff', () => {
  // Built inside each test, so a diff bug that throws fails that test instead of the whole file.
  const rows = () => baselineDiff(baseline, designs, catalogIndex, grid);
  const row = (id: string) => rows().find((entry) => entry.featureId === id);

  it('classifies a move over 1 m as moved', () => {
    expect(row('oak')).toMatchObject({ movedPercent: 25, removedPercent: 25, resizedPercent: 0 });
  });

  it('classifies an area change over 10 percent as resized', () => {
    // The 20 percent larger garden also moves its centre 1 m, which is not over 1 m.
    expect(row('garden')).toMatchObject({
      movedPercent: 0,
      resizedPercent: 25,
      removedPercent: 25,
    });
  });

  it('tracks paths by id with their centre and length', () => {
    expect(row('trail')).toMatchObject({ movedPercent: 25, resizedPercent: 0, removedPercent: 50 });
  });

  it('labels each feature with its catalog name', () => {
    expect(row('oak')?.label).toBe('Garry oak');
    expect(row('trail')?.label).toBe('Gravel path');
    expect(rows().map((entry) => entry.kind)).toEqual(['item', 'area', 'path']);
  });

  it('says where each feature is on the site, in thirds, with no id', () => {
    // Thirds split at 10 m and 20 m, and an edge belongs to the third that starts there: the oak
    // at (10, 10) is in the centre, the garden centre (5, 5) in the south-west and the trail
    // centre (10, 20) in the north.
    expect(rows().map((entry) => entry.where)).toEqual(['centre', 'south-west', 'north']);
    const cedars = designOf({
      items: [itemAt('a', 'western-red-cedar', 15, 28), itemAt('b', 'western-red-cedar', 15, 15)],
    });
    const places = baselineDiff(cedars, [], catalogIndex, grid).map((entry) => entry.where);
    expect(places).toEqual(['north', 'centre']);
  });

  it('returns no rows without a baseline and zero shares without designs', () => {
    expect(baselineDiff(null, designs, catalogIndex, grid)).toEqual([]);
    expect(baselineDiff(baseline, [], catalogIndex, grid)[0]).toMatchObject({ movedPercent: 0 });
  });
});

describe('siteSection', () => {
  it('puts the far corners of the site in the corner sections', () => {
    expect(siteSection({ x: 30, y: 0 }, grid)).toBe('south-east');
    expect(siteSection({ x: 30, y: 30 }, grid)).toBe('north-east');
  });

  it('measures from the grid origin in whole cells of the grid size', () => {
    // 10 by 10 cells of 3 m from (100, 200): thirds split at 110 and 120 east, 210 and 220 north.
    const shifted = { width: 10, height: 10, cellM: 3, originLocal: { x: 100, y: 200 } };
    expect(siteSection({ x: 105, y: 225 }, shifted)).toBe('north-west');
    expect(siteSection({ x: 125, y: 205 }, shifted)).toBe('south-east');
  });
});

const walk: PathInput = {
  id: 'walk',
  surface: 'gravel',
  widthM: 2,
  points: [
    { x: 2, y: 2 },
    { x: 12, y: 2 },
  ],
};
const rowFor = (id: string, base: DesignParts, parts: readonly DesignParts[]) =>
  baselineDiff(
    designOf(base),
    parts.map((part, index) => syntheticDesign({ id: `d${String(index)}`, parts: part })),
    catalogIndex,
    grid,
  ).find((entry) => entry.featureId === id);

describe('baselineDiff sizes of paths and areas', () => {
  it('resizes a path lengthened 12 percent and not one lengthened 4 percent', () => {
    const longer = { ...walk, points: [walk.points[0], { x: 13.2, y: 2 }] } as PathInput;
    const barely = { ...walk, points: [walk.points[0], { x: 12.4, y: 2 }] } as PathInput;
    const row = rowFor('walk', { paths: [walk] }, [{ paths: [longer] }, { paths: [barely] }]);
    expect(row?.resizedPercent).toBe(50);
  });
  it('resizes a path made 50 percent wider in place', () => {
    const row = rowFor('walk', { paths: [walk] }, [{ paths: [{ ...walk, widthM: 3 }] }]);
    expect(row).toMatchObject({ resizedPercent: 100, movedPercent: 0 });
  });
  it('does not resize an area grown exactly 10 percent, only one grown more', () => {
    const exact = { ...garden, polygon: rectangle(0, 0, 11, 10) };
    const more = { ...garden, polygon: rectangle(0, 0, 11.5, 10) };
    const row = rowFor('garden', { areas: [garden] }, [{ areas: [exact] }, { areas: [more] }]);
    expect(row?.resizedPercent).toBe(50);
  });
});

describe('baselineDiff items and missing matches', () => {
  it('resizes an item scaled 8 percent each way, a 16.6 percent larger footprint', () => {
    const tree = { ...itemAt('cedar', 'western-red-cedar', 5, 5), scaleJitter: 1 };
    const row = rowFor('cedar', { items: [tree] }, [{ items: [{ ...tree, scaleJitter: 1.08 }] }]);
    expect(row?.resizedPercent).toBe(100);
  });
  it('still measures an item the catalog does not know, as a 1 m square labelled by its id', () => {
    const mystery = { ...itemAt('m', 'not-in-catalog', 5, 5), scaleJitter: 1 };
    const row = rowFor('m', { items: [mystery] }, [{ items: [{ ...mystery, scaleJitter: 1.08 }] }]);
    expect(row).toMatchObject({ label: 'not-in-catalog', resizedPercent: 100 });
  });
  it('counts a baseline area or path as removed when a design has only other ones', () => {
    const lawn = { ...garden, id: 'lawn' };
    const other = { ...walk, id: 'other' };
    expect(rowFor('garden', { areas: [garden] }, [{ areas: [lawn] }])?.removedPercent).toBe(100);
    expect(rowFor('walk', { paths: [walk] }, [{ paths: [other] }])?.removedPercent).toBe(100);
  });
  it('never resizes a baseline path of zero length', () => {
    const dot = {
      ...walk,
      points: [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ],
    } as PathInput;
    const drawn = {
      ...walk,
      points: [
        { x: 5, y: 5 },
        { x: 8, y: 5 },
      ],
    } as PathInput;
    expect(rowFor('walk', { paths: [dot] }, [{ paths: [drawn] }])?.resizedPercent).toBe(0);
  });
});
