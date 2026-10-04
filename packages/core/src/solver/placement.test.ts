import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { catalogIndex } from '../catalog/catalog.js';
import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap, type Heightmap } from '../metrics/heightmap.js';

import type { PlannedFeature } from './features.js';
import { createIdSource } from './ids.js';
import type { IntentPlacement } from './intent.js';
import { placeFeatures, type PlacementInput } from './placement.js';
import { buildSite, indexOf, type Site } from './site.js';

function feature(id: string, placement?: IntentPlacement): PlannedFeature {
  const entry = catalogIndex.get(id);
  if (entry === undefined || entry.geometryKind === 'linear') throw new Error(id);
  return { entry, sizing: { kind: 'preset', size: 'small' }, placement, origin: 'intent' };
}

function inputFor(site: Site, features: PlannedFeature[]): PlacementInput {
  return {
    site,
    free: Uint8Array.from(site.parcel.cells),
    score: Float64Array.from(site.parcel.cells),
    features,
    places: [],
    random: createSeededRandom(1),
    ids: createIdSource([]),
  };
}

const flat20 = buildSite(rectangleParcel(20, 20), makeFlatHeightmap({ width: 20, height: 20 }));

describe('placeFeatures', () => {
  it('puts a feature in the compass zone it asks for', () => {
    const result = placeFeatures(
      inputFor(flat20, [feature('playground-structure', { zone: 'north-east' })]),
    );
    const [placed] = result.placed;
    expect(placed?.centre.x).toBeGreaterThan(13);
    expect(placed?.centre.y).toBeGreaterThan(13);
    expect(placed?.unmetHint).toBeUndefined();
  });

  it('places the largest footprint first', () => {
    const result = placeFeatures(inputFor(flat20, [feature('bench'), feature('pond')]));
    expect(result.placed.map((placed) => placed.feature.entry.id)).toEqual(['pond', 'bench']);
    expect(result.areas).toHaveLength(1);
    expect(result.items).toHaveLength(1);
  });

  it('keeps items of one category at least 4 m apart', () => {
    const benches = Array.from({ length: 3 }, () => feature('bench'));
    const result = placeFeatures(inputFor(flat20, benches));
    const [a, b, c] = result.placed.map((placed) => placed.box);
    [
      [a, b],
      [a, c],
      [b, c],
    ].forEach(([first, second]) => {
      if (first === undefined || second === undefined) throw new Error('missing');
      const gapX = Math.max(
        second.i0 - (first.i0 + first.columns),
        first.i0 - (second.i0 + second.columns),
      );
      const gapY = Math.max(
        second.j0 - (first.j0 + first.rows),
        first.j0 - (second.j0 + second.rows),
      );
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(4);
    });
  });
});

describe('placeFeatures limits', () => {
  it('places features added for a project rule before larger ones', () => {
    const repair = { ...feature('bench'), origin: 'repair' as const };
    const site = buildSite(rectangleParcel(40, 40), makeFlatHeightmap({ width: 40, height: 40 }));
    const result = placeFeatures(inputFor(site, [feature('pond'), repair]));
    expect(result.placed.map((placed) => placed.feature.entry.id)).toEqual(['bench', 'pond']);
  });

  it('reports what does not fit', () => {
    const result = placeFeatures(inputFor(flat20, [feature('tennis-court')]));
    expect(result.placed).toEqual([]);
    expect(result.unplaced.map((planned) => planned.entry.id)).toEqual(['tennis-court']);
  });

  it('keeps footprints off cells that are not free', () => {
    const input = inputFor(flat20, [feature('outdoor-fitness-station')]);
    const free = Uint8Array.from(flat20.parcel.cells);
    for (let j = 0; j < 20; j += 1)
      for (let i = 0; i < 14; i += 1) free[indexOf(flat20.grid, i, j)] = 0;
    const result = placeFeatures({ ...input, free });
    expect(result.placed[0]?.box.i0).toBeGreaterThanOrEqual(14);
    result.occupied.forEach((cell, index) => {
      if (cell === 1) expect(free[index]).toBe(1);
    });
  });

  it('keeps a feature on ground within its maximum grade', () => {
    const heightmap: Heightmap = makeFlatHeightmap({ width: 30, height: 12 });
    // Rises 0.1 m per metre over the western half; flat in the east.
    heightmap.elevations.forEach((_, index) => {
      heightmap.elevations[index] = Math.max(0, 15 - (index % 30)) * 0.1;
    });
    const site = buildSite(rectangleParcel(30, 12), heightmap);
    const result = placeFeatures(inputFor(site, [feature('spray-pad')]));
    const box = result.placed[0]?.box;
    expect(box?.i0).toBeGreaterThanOrEqual(16);
  });

  it('notes a hint it could not meet', () => {
    const input = inputFor(flat20, [feature('swings', { zone: 'south-west' })]);
    const free = Uint8Array.from(flat20.parcel.cells);
    for (let j = 0; j < 10; j += 1)
      for (let i = 0; i < 10; i += 1) free[indexOf(flat20.grid, i, j)] = 0;
    const [placed] = placeFeatures({ ...input, free }).placed;
    expect(placed?.unmetHint).toEqual({ kind: 'zone', zone: 'south-west' });
  });
});
