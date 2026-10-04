import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { designOf, itemAt, rectangle, type DesignParts } from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf } from './raster.js';
import { forbiddenZoneHits, lockedOverlaps } from './zones.js';

const grid = gridOf(makeFlatHeightmap({ width: 50, height: 50 }));
const footprintsOf = (parts: DesignParts) =>
  designFootprints({ document: designOf(parts), catalog: catalogIndex, grid });
const zones = designOf({
  zones: [
    { id: 'z1', kind: 'forbidden', polygon: rectangle(0, 0, 10, 10), label: 'Sewer easement' },
    { id: 'z2', kind: 'noGrade', polygon: rectangle(30, 30, 40, 40), label: 'Creek bank' },
  ],
}).zones;

describe('forbiddenZoneHits', () => {
  it('reports an item inside a forbidden zone', () => {
    const hits = forbiddenZoneHits(footprintsOf({ items: [itemAt('b1', 'bench', 5, 5)] }), zones);
    expect(hits).toEqual([
      { elementId: 'b1', label: 'Bench', zoneId: 'z1', zoneLabel: 'Sewer easement' },
    ]);
  });

  it('passes an item outside every forbidden zone', () => {
    expect(
      forbiddenZoneHits(footprintsOf({ items: [itemAt('b1', 'bench', 25, 25)] }), zones),
    ).toEqual([]);
  });

  it('reports paths and areas that cross a zone', () => {
    const footprints = footprintsOf({
      paths: [
        {
          id: 'p',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 5, y: 20 },
            { x: 5, y: 2 },
          ],
        },
      ],
      areas: [{ id: 'lawn', catalogId: 'lawn', polygon: rectangle(8, 8, 20, 20), locked: false }],
    });
    expect(forbiddenZoneHits(footprints, zones).map((hit) => hit.elementId)).toEqual(['lawn', 'p']);
  });

  it('ignores locked elements and no-grade zones', () => {
    const footprints = footprintsOf({
      items: [{ ...itemAt('old', 'bench', 5, 5), locked: true }, itemAt('b2', 'bench', 35, 35)],
    });
    expect(forbiddenZoneHits(footprints, zones)).toEqual([]);
  });
});

describe('lockedOverlaps', () => {
  const washroom = { ...itemAt('wc', 'washroom-building', 20, 20), locked: true };

  it('reports a new item placed on a locked item', () => {
    const overlaps = lockedOverlaps(
      footprintsOf({ items: [washroom, itemAt('b1', 'bench', 21, 20)] }),
    );
    expect(overlaps).toEqual([
      { elementId: 'b1', label: 'Bench', lockedId: 'wc', lockedLabel: 'Washroom' },
    ]);
  });

  it('passes items clear of locked items and locked items touching each other', () => {
    const otherLocked = { ...itemAt('wc2', 'washroom-building', 22, 20), locked: true };
    const footprints = footprintsOf({
      items: [washroom, otherLocked, itemAt('b1', 'bench', 40, 40)],
    });
    expect(lockedOverlaps(footprints)).toEqual([]);
  });

  describe("with features from today's park", () => {
    const cherry = {
      ...itemAt('existing-public-trees-274389', 'flowering-cherry', 15, 15),
      locked: true,
    };
    const gardenPolygon = rectangle(10, 10, 20, 20);

    it('does not count a locked tree that stands in an existing garden today', () => {
      const garden = {
        id: 'existing-overpass-way/118373967',
        catalogId: 'community-garden',
        polygon: gardenPolygon,
        locked: false,
      };
      expect(lockedOverlaps(footprintsOf({ items: [cherry], areas: [garden] }))).toEqual([]);
    });

    it('still reports a new garden drawn over a locked tree', () => {
      const garden = {
        id: 'g1',
        catalogId: 'community-garden',
        polygon: gardenPolygon,
        locked: false,
      };
      expect(lockedOverlaps(footprintsOf({ items: [cherry], areas: [garden] }))).toEqual([
        {
          elementId: 'g1',
          label: 'Community garden',
          lockedId: 'existing-public-trees-274389',
          lockedLabel: 'Flowering cherry',
        },
      ]);
    });
  });
});
