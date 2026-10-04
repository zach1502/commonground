import { describe, expect, it } from 'vitest';

import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap, makeRampHeightmap } from '../metrics/heightmap.js';
import { emptyMask } from '../metrics/raster.js';

import {
  compassZoneAt,
  compassZoneIn,
  findPlace,
  hintMet,
  preferenceAt,
  resolveHints,
  terrainMask,
  zoneMask,
} from './hints.js';
import { buildSite, indexOf } from './site.js';

const flat = buildSite(rectangleParcel(30, 30), makeFlatHeightmap({ width: 30, height: 30 }));
const ramp = buildSite(
  rectangleParcel(30, 30),
  makeRampHeightmap({ width: 30, height: 30, gradeY: 0.02 }),
);

describe('compass zones', () => {
  it('splits the parcel into thirds with north at the top', () => {
    expect(compassZoneAt(flat, { x: 15, y: 15 })).toBe('centre');
    expect(compassZoneAt(flat, { x: 25, y: 25 })).toBe('north-east');
    expect(compassZoneAt(flat, { x: 15, y: 2 })).toBe('south');
    expect(compassZoneAt(flat, { x: 2, y: 15 })).toBe('west');
  });

  it('reads the zone from a bare parcel outline, as the site does', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 0, y: 30 },
    ];
    expect(compassZoneIn(outline, { x: 25, y: 25 })).toBe('north-east');
    expect(compassZoneIn(outline, { x: 15, y: 2 })).toBe(compassZoneAt(flat, { x: 15, y: 2 }));
  });

  it('covers a ninth of the parcel per zone', () => {
    const mask = zoneMask(flat, 'south-east');
    expect(mask.cells.reduce((total, cell) => total + cell, 0)).toBe(100);
    expect(mask.cells[indexOf(flat.grid, 25, 5)]).toBe(1);
  });
});

describe('terrainMask', () => {
  it('marks the lowest quarter as low and the highest quarter as high', () => {
    const low = terrainMask(ramp, 'low');
    const high = terrainMask(ramp, 'high');
    expect(low.cells[indexOf(ramp.grid, 10, 2)]).toBe(1);
    expect(low.cells[indexOf(ramp.grid, 10, 20)]).toBe(0);
    expect(high.cells[indexOf(ramp.grid, 10, 28)]).toBe(1);
  });

  it('marks cells within 8 m of the boundary as edge', () => {
    const edge = terrainMask(flat, 'edge');
    expect(edge.cells[indexOf(flat.grid, 0, 15)]).toBe(1);
    expect(edge.cells[indexOf(flat.grid, 7, 15)]).toBe(1);
    expect(edge.cells[indexOf(flat.grid, 15, 15)]).toBe(0);
  });

  it('marks all of a flat parcel as flat', () => {
    const mask = terrainMask(flat, 'flat');
    expect(mask.cells.every((cell) => cell === 1)).toBe(true);
  });
});

describe('places', () => {
  const pond = emptyMask(flat.grid);
  pond.cells[indexOf(flat.grid, 5, 5)] = 1;
  const places = [{ labels: ['pond', 'water'], mask: pond }];

  it('finds a place by name with or without "the" and plurals', () => {
    expect(findPlace(places, 'the pond')).toBeDefined();
    expect(findPlace(places, 'ponds')).toBeDefined();
    expect(findPlace(places, 'the tennis court')).toBeUndefined();
  });

  it('prefers cells near a named place and reports names it cannot find', () => {
    const { hints, missing } = resolveHints(
      flat,
      { near: 'the pond', awayFrom: 'the moon' },
      places,
    );
    expect(missing).toEqual(['the moon']);
    const nearby = preferenceAt(hints, indexOf(flat.grid, 6, 5));
    const far = preferenceAt(hints, indexOf(flat.grid, 25, 25));
    expect(nearby).toBeGreaterThan(far);
    expect(hintMet(hints[0], indexOf(flat.grid, 8, 5))).toBe(true);
    expect(hintMet(hints[0], indexOf(flat.grid, 25, 25))).toBe(false);
  });

  it('prefers cells away from a named place', () => {
    const { hints } = resolveHints(flat, { awayFrom: 'pond' }, places);
    expect(preferenceAt(hints, indexOf(flat.grid, 5, 5))).toBe(0);
    expect(hintMet(hints[0], indexOf(flat.grid, 29, 29))).toBe(true);
  });

  it('gives full preference inside a zone and less outside it', () => {
    const { hints } = resolveHints(flat, { zone: 'north' }, []);
    expect(preferenceAt(hints, indexOf(flat.grid, 15, 25))).toBe(1);
    expect(preferenceAt(hints, indexOf(flat.grid, 15, 5))).toBeLessThan(1);
    expect(preferenceAt([], 0)).toBe(1);
  });
});
