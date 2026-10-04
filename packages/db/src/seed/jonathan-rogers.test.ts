import { describe, expect, it } from 'vitest';

import { catalogIndex, computeMetrics, failedConstraints } from '@parkshape/core';

import { HEIGHTMAP_REF, JONATHAN_ROGERS, loadJonathanRogersSite } from './jonathan-rogers.js';

const TREE_COUNT = 22;
const LOCKED_TREES = 12;
const GRID = { width: 176, height: 86 };

describe('loadJonathanRogersSite', () => {
  const site = loadJonathanRogersSite();
  const trees = site.baseline.items.filter(
    (item) => catalogIndex.get(item.catalogId)?.category === 'tree',
  );

  it('reads the real parcel and its heightmap', () => {
    expect(site.name).toBe(JONATHAN_ROGERS);
    expect(site.parcel.polygon).toHaveLength(4);
    expect(site.heightmap.width).toBe(GRID.width);
    expect(site.heightmap.height).toBe(GRID.height);
    expect(site.heightmap.elevations).toHaveLength(GRID.width * GRID.height);
    expect(site.heightmapRef).toBe(HEIGHTMAP_REF);
    expect(site.blobs.map(({ key }) => key)).toEqual([
      'terrain/jonathan-rogers.json',
      'terrain/jonathan-rogers.bin',
    ]);
  });

  it('keeps all 22 measured trees and locks the 12 large ones', () => {
    expect(trees).toHaveLength(TREE_COUNT);
    expect(trees.filter(({ locked }) => locked)).toHaveLength(LOCKED_TREES);
    expect(trees.every(({ dbhCm }) => dbhCm !== undefined)).toBe(true);
  });

  it('locks the field house as the washroom and draws the garden footprint', () => {
    const washroom = site.baseline.items.find(({ catalogId }) => catalogId === 'washroom-building');
    expect(washroom?.locked).toBe(true);
    expect(site.baseline.areas.map(({ catalogId }) => catalogId).sort()).toEqual([
      'community-garden',
      'lawn',
    ]);
  });

  it('uses the demo parameters', () => {
    expect(site.parameters.requiredFeatures).toEqual([
      { category: 'garden', minCount: 1, minPlots: 20 },
    ]);
  });

  it('is submittable as it is today, with no hard rule failing on the fork', () => {
    const report = computeMetrics({
      document: site.baseline,
      parameters: site.parameters,
      parcel: site.parcel,
      catalog: catalogIndex,
      heightmap: site.heightmap,
    });
    if (!report.ok) throw new Error(JSON.stringify(report.error));
    expect(report.value.constraints.forbiddenZones.status).toBe('ok');
    expect(failedConstraints(report.value)).toEqual([]);
  });
});

describe('the Jonathan Rogers garden record', () => {
  const site = loadJonathanRogersSite();

  it('gives the garden the 56 plots the site record lists, and metrics report them', () => {
    const garden = site.baseline.areas.find(({ catalogId }) => catalogId === 'community-garden');
    expect(garden?.recordedPlots).toBe(56);
    const report = computeMetrics({
      document: site.baseline,
      baseline: site.baseline,
      parameters: site.parameters,
      parcel: site.parcel,
      catalog: catalogIndex,
      heightmap: site.heightmap,
    });
    expect(report.ok && report.value.totals.gardenPlots).toBe(56);
  });
});

describe('the Jonathan Rogers project settings', () => {
  const site = loadJonathanRogersSite();

  it('gives residents the Park Board scope as a two-sentence brief', () => {
    const { brief } = site.parameters;
    ['inclusive playground', 'fenced off-leash area', 'accessible paths'].forEach((scope) => {
      expect(brief).toContain(scope);
    });
    ['community garden', 'washroom', 'open space'].forEach((kept) => {
      expect(brief).toContain(kept);
    });
    expect(brief.split('. ')).toHaveLength(2);
    expect(brief).not.toMatch(/[!\u2014]/);
  });

  it('closes design on 31 October 2026', () => {
    expect(site.closesAt).toBe('2026-10-31');
  });
});

describe('the Jonathan Rogers baseline as it is today', () => {
  const site = loadJonathanRogersSite();

  it('marks the garden and lawn as existing, so their ground is not graded against new rules', () => {
    expect(site.baseline.areas.every(({ existing }) => existing === true)).toBe(true);
  });

  it('has no slope problem as it is today', () => {
    const report = computeMetrics({
      document: site.baseline,
      parameters: site.parameters,
      parcel: site.parcel,
      catalog: catalogIndex,
      heightmap: site.heightmap,
    });
    if (!report.ok) throw new Error(JSON.stringify(report.error));
    expect(report.value.constraints.slopes.status).toBe('ok');
  });
});
