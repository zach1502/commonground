import { describe, expect, it } from 'vitest';

import { catalogIndex, catalogItems, createSeededRandom } from '@parkshape/core';

import { NO_VARIATION, sceneCatalogOf, toParkDocument } from './document-adapter.js';
import { newElementId, treeScaleJitter } from './ids.js';
import { docOf, square, treeInput } from './test-fixtures.js';

describe('toParkDocument', () => {
  const doc = docOf({
    items: [{ ...treeInput('t1', 3, 4), rotationDeg: 90, scaleJitter: 1.05 }],
    paths: [
      {
        id: 'p1',
        surface: 'gravel',
        widthM: 2,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ],
    areas: [
      { id: 'a1', catalogId: 'community-garden', polygon: square(20, 20, 10), locked: false },
      { id: 'w1', catalogId: 'pond', polygon: square(40, 40, 10), locked: false },
      { id: 'd1', catalogId: 'off-leash-area', polygon: square(0, 40, 30), locked: false },
    ],
  });

  it('puts local north on the scene z axis and turns rotation into radians', () => {
    const park = toParkDocument(doc, catalogIndex);
    expect(park.items[0]).toMatchObject({
      id: 't1',
      catalogId: 'bigleaf-maple',
      position: { x: 3, z: 4 },
      scale: 1.05,
    });
    expect(park.items[0]?.rotationY).toBeCloseTo(-Math.PI / 2);
  });

  it('draws paths through a smooth curve of their points', () => {
    const [path] = toParkDocument(doc, catalogIndex).paths;
    expect(path?.points.length).toBeGreaterThan(3);
    expect(path?.points[0]).toEqual({ x: 0, z: 0 });
    expect(path?.points.at(-1)).toEqual({ x: 10, z: 10 });
  });

  it('sends water areas to the water layer and names the other area kinds', () => {
    const park = toParkDocument(doc, catalogIndex);
    expect(park.areas.map((area) => [area.id, area.kind])).toEqual([
      ['a1', 'garden'],
      ['d1', 'dog-park'],
    ]);
    expect(park.water.map((water) => water.id)).toEqual(['w1']);
  });

  it('skips items the catalog does not know', () => {
    const unknown = docOf({ items: [{ ...treeInput('x', 1, 1), catalogId: 'rocket' }] });
    expect(toParkDocument(unknown, catalogIndex).items).toEqual([]);
  });
});

describe('sceneCatalogOf', () => {
  it('maps core categories onto the scene model groups', () => {
    const scene = sceneCatalogOf(catalogItems);
    const categoryOf = (id: string) => scene.find((entry) => entry.id === id)?.category;
    expect(categoryOf('bigleaf-maple')).toBe('tree');
    expect(categoryOf('bench')).toBe('bench');
    expect(categoryOf('washroom-building')).toBe('building');
    expect(categoryOf('swings')).toBe('play');
    expect(categoryOf('waste-bin')).toBe('other');
  });

  it('adds no extra tree size change, since items carry their own', () => {
    expect(NO_VARIATION.next()).toBe(0.5);
  });
});

describe('ids', () => {
  it('makes an id the document does not use yet', () => {
    const random = createSeededRandom(3);
    const doc = docOf({
      items: [treeInput(newElementId('item', createSeededRandom(3), docOf()), 0, 0)],
    });
    const id = newElementId('item', random, doc);
    expect(id).toMatch(/^item-[0-9a-z]{6}$/);
    expect(doc.items.map((item) => item.id)).not.toContain(id);
  });

  it('keeps tree scale between 0.9 and 1.1', () => {
    expect(treeScaleJitter({ next: () => 0 })).toBe(0.9);
    expect(treeScaleJitter({ next: () => 0.99999 })).toBe(1.1);
  });
});
