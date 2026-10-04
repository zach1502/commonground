import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import {
  designOf,
  itemAt,
  rectangle,
  rectangleParcel,
} from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap, makeRampHeightmap } from '../metrics/heightmap.js';
import { zoneSchema } from '../schema/design.js';

import { buildSite, indexOf, pointOf } from './site.js';
import { entranceCells, siteBlockers, suitabilityGrid } from './suitability.js';

const forbidden = zoneSchema.parse({
  id: 'z1',
  kind: 'forbidden',
  polygon: rectangle(0, 0, 2, 2),
  label: 'Sewer line',
});

function blockersFor(baseline = designOf()) {
  const site = buildSite(rectangleParcel(10, 10), makeFlatHeightmap({ width: 12, height: 10 }));
  const blockers = siteBlockers({
    site,
    baseline,
    zones: [forbidden],
    catalog: catalogIndex,
    rootZonePerDbhCm: 0.1,
  });
  return { site, blockers };
}

describe('suitabilityGrid', () => {
  it('scores 1 on flat open ground and 0 outside the parcel and in forbidden zones', () => {
    const { site, blockers } = blockersFor();
    const score = suitabilityGrid(site, blockers);
    expect(score[indexOf(site.grid, 5, 5)]).toBe(1);
    expect(score[indexOf(site.grid, 11, 5)]).toBe(0);
    expect(score[indexOf(site.grid, 1, 1)]).toBe(0);
    expect(score[indexOf(site.grid, 2, 2)]).toBe(1);
  });

  it('scores 0 on locked footprints and in the root zone of a locked tree', () => {
    const tree = { ...itemAt('t1', 'garry-oak', 7.5, 7.5), locked: true, dbhCm: 20 };
    const bench = { ...itemAt('b1', 'bench', 3.5, 7.5), locked: true };
    const { site, blockers } = blockersFor(designOf({ items: [tree, bench] }));
    const score = suitabilityGrid(site, blockers);
    // A 20 cm trunk at 0.1 m per cm protects a 2 m radius.
    expect(score[indexOf(site.grid, 7, 9)]).toBe(0);
    expect(score[indexOf(site.grid, 7, 4)]).toBe(1);
    expect(score[indexOf(site.grid, 3, 7)]).toBe(0);
  });

  it('scores 0 on unlocked footprints the layout keeps', () => {
    const lawn = { id: 'a1', catalogId: 'lawn', polygon: rectangle(4, 4, 7, 7), locked: false };
    const { site, blockers } = blockersFor(designOf({ areas: [lawn] }));
    const score = suitabilityGrid(site, blockers);
    expect(score[indexOf(site.grid, 5, 5)]).toBe(0);
    expect(blockers.locked.cells[indexOf(site.grid, 5, 5)]).toBe(0);
    expect(blockers.kept.cells[indexOf(site.grid, 5, 5)]).toBe(1);
  });

  it('takes a slope penalty of 5 per unit of slope', () => {
    const site = buildSite(
      rectangleParcel(10, 10),
      makeRampHeightmap({ width: 10, height: 10, gradeX: 0.1 }),
    );
    const blockers = siteBlockers({
      site,
      baseline: designOf(),
      zones: [],
      catalog: catalogIndex,
      rootZonePerDbhCm: 0.1,
    });
    expect(suitabilityGrid(site, blockers)[indexOf(site.grid, 5, 5)]).toBeCloseTo(0.5);
  });
});

describe('entranceCells', () => {
  it('puts one entrance near each corner and each edge midpoint', () => {
    const { site } = blockersFor();
    const free = Uint8Array.from(site.parcel.cells);
    const points = entranceCells(site, free).map((index) => pointOf(site.grid, index));
    expect(points).toHaveLength(8);
    expect(points).toContainEqual({ x: 1.5, y: 1.5 });
    // The midpoint (5, 0) sits between two cells; the tie goes to the western one.
    expect(points).toContainEqual({ x: 4.5, y: 1.5 });
  });

  it('moves an entrance to the nearest free cell', () => {
    const { site } = blockersFor();
    const free = Uint8Array.from(site.parcel.cells);
    free[indexOf(site.grid, 1, 1)] = 0;
    const points = entranceCells(site, free).map((index) => pointOf(site.grid, index));
    expect(points).not.toContainEqual({ x: 1.5, y: 1.5 });
    expect(points).toHaveLength(8);
  });
});
