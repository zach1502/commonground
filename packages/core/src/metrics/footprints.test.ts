import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { designOf, itemAt, rectangle } from './fixtures/design-builders.js';
import { designFootprints, elementKindSchema } from './footprints.js';
import { makeFlatHeightmap } from './heightmap.js';
import { countCells, gridOf } from './raster.js';

const grid = gridOf(makeFlatHeightmap({ width: 40, height: 40 }));

describe('designFootprints', () => {
  const document = designOf({
    items: [itemAt('b-2', 'bench', 10, 10), { ...itemAt('b-1', 'bench', 20, 10), locked: true }],
    paths: [
      {
        id: 'walk',
        surface: 'asphalt',
        widthM: 2,
        points: [
          { x: 2, y: 30 },
          { x: 12, y: 30 },
        ],
      },
    ],
    areas: [
      {
        id: 'plots',
        catalogId: 'community-garden',
        polygon: rectangle(0, 0, 12, 9),
        locked: false,
      },
    ],
  });
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const footprints = () => designFootprints({ document, catalog: catalogIndex, grid });

  it('lists items and areas by id, then paths in drawing order', () => {
    expect(footprints().map(({ id }) => id)).toEqual(['b-1', 'b-2', 'plots', 'walk']);
  });

  it('names each element for messages by catalog name, never by id', () => {
    expect(footprints().map(({ label }) => label)).toEqual([
      'Bench',
      'Bench',
      'Community garden',
      'Path 1',
    ]);
  });

  it('keeps the locked flag and the catalog entry', () => {
    expect(footprints()[0]?.locked).toBe(true);
    expect(footprints()[3]?.entry.id).toBe('path-asphalt');
  });

  it('measures item footprints exactly and paths by their ribbon', () => {
    expect(footprints()[0]?.areaM2).toBeCloseTo(1.8 * 1, 9);
    expect(footprints()[2]?.areaM2).toBe(108);
    expect(footprints()[3]?.areaM2).toBe(24);
    const walk = footprints()[3];
    expect(walk === undefined ? 0 : countCells(walk.mask)).toBe(24);
  });

  it('counts fitted modules on areas only', () => {
    expect(footprints().map(({ moduleCount }) => moduleCount)).toEqual([0, 0, 12, 0]);
  });
});

describe('designFootprints catalog checks', () => {
  it('skips elements whose catalog entry is missing or of the wrong kind', () => {
    const odd = designOf({
      items: [itemAt('ghost', 'no-such-item', 1, 1), itemAt('lawn-as-item', 'lawn', 1, 1)],
      areas: [
        { id: 'bench-area', catalogId: 'bench', polygon: rectangle(0, 0, 2, 2), locked: false },
      ],
    });
    expect(designFootprints({ document: odd, catalog: catalogIndex, grid })).toEqual([]);
  });
});

describe('designFootprints edge cases', () => {
  it('measures an item footprint as width times depth', () => {
    // The path light is 0.22 by 1.76 m.
    const document = designOf({ items: [itemAt('lamp', 'path-light', 10, 10)] });
    const [lamp] = designFootprints({ document, catalog: catalogIndex, grid });
    expect(lamp?.areaM2).toBeCloseTo(0.22 * 1.76, 9);
  });

  it('leaves out items, areas and paths the catalog does not know', () => {
    const document = designOf({
      items: [itemAt('x', 'not-in-catalog', 10, 10)],
      areas: [
        { id: 'y', catalogId: 'not-in-catalog', polygon: rectangle(0, 0, 4, 4), locked: false },
      ],
      paths: [
        {
          id: 'z',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 0, y: 20 },
            { x: 10, y: 20 },
          ],
        },
      ],
    });
    const withoutPaths = new Map([...catalogIndex].filter(([id]) => !id.startsWith('path-')));
    expect(designFootprints({ document, catalog: withoutPaths, grid })).toEqual([]);
  });
});

describe('elementKindSchema', () => {
  it('names the three kinds of element a footprint or comment can point at', () => {
    expect(elementKindSchema.options).toEqual(['item', 'path', 'area']);
    expect(elementKindSchema.safeParse('zone').success).toBe(false);
  });
});
