import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { computeMetrics } from './compute.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangle,
  rectangleParcel,
} from './fixtures/design-builders.js';
import { makeRampHeightmap } from './heightmap.js';

const TREE_ID = 'existing-public-trees-274389';
const BENCH_ID = '3f2b9c1e-8d4a-4b7e-9c21-5a6d7e8f9a0b';
const PLAY_ID = 'item-1727382000000-play';
const GARDEN_ID = 'existing-overpass-way/118373967';
const ZONE_ID = 'zone-sewer-1';
// Slugs, uuids and "existing-" feature ids are what residents must never read.
const ID_PATTERN = /existing-|[0-9a-f]{8}-[0-9a-f]{4}-|\b[a-z]+-\d{3,}|way\/\d+/;

type Placement = 'on the tree' | 'in the zone';

// The zone rule reports its first problem, so each placement puts one bench where it fails.
function failingDesign(placement: Placement) {
  const bench =
    placement === 'on the tree'
      ? itemAt(BENCH_ID, 'bench', 20, 20)
      : itemAt(PLAY_ID, 'bench', 5, 5);
  return designOf({
    items: [{ ...itemAt(TREE_ID, 'flowering-cherry', 20, 20), locked: true }, bench],
    areas: [
      {
        id: GARDEN_ID,
        catalogId: 'community-garden',
        polygon: rectangle(26, 26, 30, 30),
        locked: false,
      },
    ],
    zones: [
      { id: ZONE_ID, kind: 'forbidden', polygon: rectangle(0, 0, 10, 10), label: 'Sewer easement' },
    ],
    cells: [{ x: 21, y: 20, deltaM: -0.5 }],
  });
}

describe('constraint messages', () => {
  it.each([
    ['on the tree', 'Bench overlaps a locked Flowering cherry. Move it to open ground.'],
    ['in the zone', 'Bench is in the closed zone Sewer easement. Move it outside the zone.'],
  ] as const)('name a bench %s by its catalog name and never by id', (placement, expected) => {
    const severity = { ...parametersWith().severity, treeProtection: 'hard' } as const;
    const result = computeMetrics({
      document: failingDesign(placement),
      parcel: rectangleParcel(40, 40),
      parameters: parametersWith({ severity }),
      catalog: catalogIndex,
      heightmap: makeRampHeightmap({ width: 40, height: 40, gradeX: 0.07 }),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const messages = Object.values(result.value.constraints).map(({ message }) => message);
    expect(messages).toContain(expected);
    expect(result.value.constraints.treeProtection.message).toContain(
      'root zone of Flowering cherry.',
    );
    for (const message of messages) {
      expect(message).not.toMatch(ID_PATTERN);
      for (const id of [TREE_ID, BENCH_ID, PLAY_ID, GARDEN_ID, ZONE_ID]) {
        expect(message).not.toContain(id);
      }
    }
  });
});
