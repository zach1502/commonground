import { describe, expect, it } from 'vitest';

import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap, makeRampHeightmap } from '../metrics/heightmap.js';
import { emptyMask, rasterizeRibbon } from '../metrics/raster.js';
import { measurePathSlopes } from '../metrics/slopes.js';

import { createIdSource } from './ids.js';
import { dilate, pathCostGrid } from './path-costs.js';
import { planPaths, type PathPlanInput } from './paths.js';
import { buildSite, indexOf, pointOf, type Site } from './site.js';
import { entranceCells } from './suitability.js';

const WIDTH_M = 2;
const LIMITS = { maxRunning: 0.05, maxCross: 0.02 };

function inputFor(site: Site, patch: Partial<PathPlanInput> = {}): PathPlanInput {
  const blocked = patch.blocked ?? site.parcel.cells.map((cell) => 1 - cell);
  const costs = pathCostGrid({
    site,
    blocked,
    rootZones: emptyMask(site.grid),
    widthM: WIDTH_M,
    maxRunning: LIMITS.maxRunning,
  });
  const free = Uint8Array.from(site.parcel.cells);
  return {
    site,
    costs,
    blocked,
    style: 'loop',
    surface: 'gravel',
    widthM: WIDTH_M,
    entrances: entranceCells(site, free).map((cell) => pointOf(site.grid, cell)),
    targets: [],
    limits: LIMITS,
    ids: createIdSource([]),
    ...patch,
  };
}

const open = buildSite(rectangleParcel(40, 40), makeFlatHeightmap({ width: 40, height: 40 }));

function hitsBlocked(site: Site, plan: ReturnType<typeof planPaths>, blocked: Uint8Array) {
  return plan.paths.some((path) =>
    rasterizeRibbon(site.grid, path.points, path.widthM).cells.some(
      (cell, index) => cell === 1 && blocked[index] === 1,
    ),
  );
}

describe('dilate', () => {
  it('grows marked cells by the radius in every direction', () => {
    const grid = { width: 5, height: 5, cellM: 1, originLocal: { x: 0, y: 0 } };
    const cells = new Uint8Array(25);
    cells[indexOf(grid, 2, 2)] = 1;
    const grown = dilate(grid, cells, 1);
    expect(grown.reduce((total, cell) => total + cell, 0)).toBe(9);
    expect(grown[indexOf(grid, 1, 1)]).toBe(1);
    expect(grown[indexOf(grid, 0, 0)]).toBe(0);
  });
});

describe('planPaths', () => {
  it('still closes the loop when an entrance sits in a pocket a path cannot leave', () => {
    // An L-shaped wall closes off a 14 m square in the south-east corner.
    const blocked = open.parcel.cells.map((cell, index) => {
      const i = index % open.grid.width;
      const j = Math.floor(index / open.grid.width);
      const wall = (i === 25 && j <= 15) || (j === 15 && i >= 25);
      return cell === 0 || wall ? 1 : 0;
    });
    const plan = planPaths(inputFor(open, { blocked }));
    expect(plan.paths).toHaveLength(1);
    const [path] = plan.paths;
    expect(path?.points[0]).toEqual(path?.points.at(-1));
  });

  it('draws a loop as one closed ring through the entrances', () => {
    const plan = planPaths(inputFor(open));
    expect(plan.paths).toHaveLength(1);
    const [path] = plan.paths;
    expect(path?.points[0]).toEqual(path?.points.at(-1));
    expect(path?.surface).toBe('gravel');
    expect(path?.widthM).toBe(WIDTH_M);
  });

  it('spans every entrance and feature with connect-all', () => {
    const target = { label: 'pond', centre: { x: 20, y: 20 }, areaM2: 100 };
    const input = inputFor(open, { style: 'connect-all', targets: [target] });
    const plan = planPaths(input);
    expect(plan.paths).toHaveLength(input.entrances.length);
    expect(plan.unreached).toEqual([]);
  });

  it('links the two nearest entrances to the largest feature with minimal', () => {
    const small = { label: 'bench', centre: { x: 5, y: 35 }, areaM2: 2 };
    const large = { label: 'pond', centre: { x: 30, y: 10 }, areaM2: 200 };
    const plan = planPaths(inputFor(open, { style: 'minimal', targets: [small, large] }));
    expect(plan.paths).toHaveLength(2);
    plan.paths.forEach((path) => {
      const end = path.points.at(-1);
      expect(Math.hypot((end?.x ?? 0) - 30, (end?.y ?? 0) - 10)).toBeLessThan(2);
    });
  });
});

describe('planPaths around obstacles', () => {
  it('keeps the whole path width off blocked cells', () => {
    const blocked = open.parcel.cells.map((cell) => 1 - cell);
    for (let j = 5; j < 35; j += 1)
      for (let i = 15; i < 25; i += 1) blocked[indexOf(open.grid, i, j)] = 1;
    const plan = planPaths(inputFor(open, { blocked }));
    expect(plan.paths.length).toBeGreaterThan(0);
    expect(hitsBlocked(open, plan, blocked)).toBe(false);
  });

  it('goes round a steep bump when flat ground is free', () => {
    const heightmap = makeFlatHeightmap({ width: 40, height: 20 });
    for (let j = 0; j < 14; j += 1) {
      for (let i = 18; i < 22; i += 1) heightmap.elevations[j * 40 + i] = 2;
    }
    const site = buildSite(rectangleParcel(40, 20), heightmap);
    const target = { label: 'pond', centre: { x: 36, y: 4 }, areaM2: 100 };
    const plan = planPaths(
      inputFor(site, { style: 'minimal', targets: [target], entrances: [{ x: 3, y: 4 }] }),
    );
    expect(plan.paths).toHaveLength(1);
    const [slopes] = measurePathSlopes(heightmap, plan.paths, { maxRunning: 0.05, maxCross: 1 });
    expect(slopes?.runningSegments).toEqual([]);
  });

  it('reports a feature no path can reach', () => {
    const blocked = open.parcel.cells.map((cell) => 1 - cell);
    for (let j = 0; j < 40; j += 1) blocked[indexOf(open.grid, 20, j)] = 1;
    const target = { label: 'pond', centre: { x: 35, y: 20 }, areaM2: 100 };
    const plan = planPaths(
      inputFor(open, { blocked, style: 'minimal', targets: [target], entrances: [{ x: 3, y: 3 }] }),
    );
    expect(plan.unreached).toEqual(['pond']);
  });
});

/** A 3% slope rising north up to y = 20, then level ground above it. */
function sideHillSite(): Site {
  const heightmap = makeFlatHeightmap({ width: 40, height: 32 });
  heightmap.elevations.forEach((_, index) => {
    const y = Math.floor(index / 40) + 0.5;
    heightmap.elevations[index] = 0.03 * Math.min(y, 20);
  });
  return buildSite(rectangleParcel(40, 32), heightmap);
}

describe('planPaths within the slope limits', () => {
  it('climbs to level ground rather than cross a 3% side hill', () => {
    const site = sideHillSite();
    const plan = planPaths(
      inputFor(site, {
        style: 'connect-all',
        entrances: [
          { x: 5.5, y: 6.5 },
          { x: 34.5, y: 6.5 },
        ],
      }),
    );
    expect(plan.paths).toHaveLength(1);
    const [slopes] = measurePathSlopes(site.heightmap, plan.paths, LIMITS);
    expect(slopes?.runningSegments).toEqual([]);
    expect(slopes?.crossSegments).toEqual([]);
  });

  it('keeps a path on a parcel with no level ground', () => {
    const heightmap = makeRampHeightmap({ width: 40, height: 40, gradeX: 0.08 });
    const site = buildSite(rectangleParcel(40, 40), heightmap);
    const plan = planPaths(inputFor(site));
    expect(plan.paths).toHaveLength(1);
  });

  it('ends a path to a feature on level ground rather than on the bank beside it', () => {
    // A 30% bank along the south edge up to y = 8, level ground above, and a feature on the
    // crest whose nearest open cell is on the bank.
    const heightmap = makeFlatHeightmap({ width: 40, height: 30 });
    heightmap.elevations.forEach((_, index) => {
      const y = Math.floor(index / 40) + 0.5;
      heightmap.elevations[index] = 0.3 * Math.max(0, 8 - y);
    });
    const site = buildSite(rectangleParcel(40, 30), heightmap);
    const blocked = site.parcel.cells.map((cell) => 1 - cell);
    for (let j = 8; j < 13; j += 1)
      for (let i = 15; i < 25; i += 1) blocked[indexOf(site.grid, i, j)] = 1;
    const target = { label: 'play', centre: { x: 20, y: 8 }, areaM2: 50 };
    const entrances = [{ x: 5.5, y: 25.5 }];
    const plan = planPaths(
      inputFor(site, { style: 'minimal', blocked, targets: [target], entrances }),
    );
    expect(plan.unreached).toEqual([]);
    const [slopes] = measurePathSlopes(heightmap, plan.paths, LIMITS);
    expect(slopes?.runningSegments).toEqual([]);
    expect(slopes?.crossSegments).toEqual([]);
  });
});
