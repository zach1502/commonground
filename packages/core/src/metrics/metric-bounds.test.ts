import { describe, expect, it } from 'vitest';

import { catalogIndex, type CatalogIndex } from '../catalog/catalog.js';
import { SLOPE_TOLERANCE } from '../constants.js';
import type { CatalogItem } from '../schema/catalog.js';
import type { DesignArea } from '../schema/design.js';
import { parcelSchema } from '../schema/parcel.js';
import { slope } from '../schema/units.js';

import { computeMetrics } from './compute.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangle,
  rectangleParcel,
  type AreaInput,
  type PathInput,
} from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { measureFootprintGrades } from './grade-check.js';
import { makeFlatHeightmap, makeRampHeightmap } from './heightmap.js';
import { parcelGrid } from './parcel-grid.js';
import { areaPlotCount } from './plots.js';
import { gridOf } from './raster.js';
import { measurePolyline, samplePolyline } from './slopes.js';
import { forbiddenZoneHits } from './zones.js';

const RECORDED = 56;

function gardenEntry() {
  const entry = catalogIndex.get('community-garden');
  if (entry?.geometryKind !== 'area') throw new Error('community-garden is an area');
  return entry;
}

const areasOf = (areas: readonly AreaInput[]): DesignArea[] => designOf({ areas }).areas;
const recorded: AreaInput = {
  id: 'garden',
  catalogId: 'community-garden',
  polygon: rectangle(0, 0, 20, 10),
  locked: false,
  recordedPlots: RECORDED,
};

function plotsFor(polygon: AreaInput['polygon'], baseline: readonly AreaInput[] = [recorded]) {
  const [area] = areasOf([{ ...recorded, polygon, recordedPlots: undefined }]);
  if (area === undefined) throw new Error('one area');
  return areaPlotCount(gardenEntry(), area, areasOf(baseline));
}

describe('areaPlotCount keeps the recorded plots only for the same polygon', () => {
  it('keeps them when every corner is within 1e-6 m', () => {
    expect(plotsFor(rectangle(0.000001, 0.000001, 20, 10))).toBe(RECORDED);
  });

  it('drops them when one corner moves 1 m north', () => {
    const base = rectangle(0, 0, 20, 10);
    const polygon: AreaInput['polygon'] = [
      base[0],
      base[1],
      { x: base[2].x, y: base[2].y + 1 },
      { x: 0, y: 10 },
    ];
    expect(plotsFor(polygon)).not.toBe(RECORDED);
  });

  it('drops them when the design adds a corner after the recorded ones', () => {
    expect(plotsFor([...rectangle(0, 0, 20, 10), { x: -1, y: 5 }])).not.toBe(RECORDED);
  });

  it('reads the baseline area with the same id, not the first one', () => {
    const other = { ...recorded, id: 'other-garden', recordedPlots: 3 };
    expect(plotsFor(rectangle(0, 0, 20, 10), [other, recorded])).toBe(RECORDED);
  });

  it('drops them when the baseline area has another catalog id', () => {
    const [area] = areasOf([{ ...recorded, catalogId: 'lawn', recordedPlots: undefined }]);
    if (area === undefined) throw new Error('one area');
    expect(areaPlotCount(gardenEntry(), area, areasOf([recorded]))).not.toBe(RECORDED);
  });
});

describe('parcelGrid on a 2 m grid', () => {
  it('snaps the corner down to a whole 2 m cell', () => {
    const parcel = parcelSchema.parse({
      ...rectangleParcel(1, 1),
      polygon: rectangle(5, 7, 15, 17),
    });
    expect(parcelGrid(parcel, 2)).toEqual({
      width: 6,
      height: 6,
      resolutionM: 2,
      originLocal: { x: 4, y: 6 },
    });
  });
});

describe('samplePolyline points', () => {
  it('walks forward from the first point in steps of at most 1 m', () => {
    const line = [
      { x: 2, y: 3 },
      { x: 4, y: 5 },
    ];
    const expected = [
      [2, 3],
      [8 / 3, 11 / 3],
      [10 / 3, 13 / 3],
      [4, 5],
    ];
    const samples = samplePolyline(line, 1);
    expect(samples).toHaveLength(expected.length);
    samples.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.[0] ?? Number.NaN, 9);
      expect(point.y).toBeCloseTo(expected[index]?.[1] ?? Number.NaN, 9);
    });
  });

  it('gives no points for an empty line', () => {
    expect(samplePolyline([], 1)).toEqual([]);
  });
});

describe('measurePolyline on segments shorter than 1 m', () => {
  const loose = { maxRunning: 1, maxCross: 1 };
  const along = (from: [number, number], to: [number, number]) => [
    { x: from[0], y: from[1] },
    { x: to[0], y: to[1] },
  ];

  it('reads a 4 percent running slope on a 2.5 m path', () => {
    const ramp = makeRampHeightmap({ width: 20, height: 20, gradeX: 0.04 });
    const line = { points: along([5, 10], [7.5, 10]), widthM: 2 };
    expect(measurePolyline(ramp, line, loose).maxRunning).toBeCloseTo(0.04, 5);
  });

  it('reads a 3 percent cross slope on a 2.5 m path running north', () => {
    const ramp = makeRampHeightmap({ width: 20, height: 20, gradeX: 0.03 });
    const line = { points: along([10, 5], [10, 7.5]), widthM: 2 };
    expect(measurePolyline(ramp, line, loose).maxCross).toBeCloseTo(0.03, 5);
  });

  it('reads a 3 percent cross slope across a 3 m wide path running north', () => {
    const ramp = makeRampHeightmap({ width: 20, height: 20, gradeX: 0.03 });
    const line = { points: along([10, 5], [10, 8]), widthM: 3 };
    expect(measurePolyline(ramp, line, loose).maxCross).toBeCloseTo(0.03, 5);
  });

  it('reads a 3 percent cross slope across a 3 m wide path running east', () => {
    const ramp = makeRampHeightmap({ width: 20, height: 20, gradeY: 0.03 });
    const line = { points: along([5, 10], [8, 10]), widthM: 3 };
    expect(measurePolyline(ramp, line, loose).maxCross).toBeCloseTo(0.03, 5);
  });
});

describe('measurePolyline limit boundary', () => {
  const ramp = makeRampHeightmap({ width: 20, height: 20, gradeX: 0.5 });
  const line = {
    points: [
      { x: 5.5, y: 10.5 },
      { x: 8.5, y: 10.5 },
    ],
    widthM: 2,
  };

  it('passes a running slope equal to the limit plus the tolerance', () => {
    const limit = 0.5 - SLOPE_TOLERANCE;
    expect(limit + SLOPE_TOLERANCE).toBe(0.5);
    const measured = measurePolyline(ramp, line, { maxRunning: limit, maxCross: 1 });
    expect(measured.maxRunning).toBe(0.5);
    expect(measured.runningSegments).toEqual([]);
  });

  it('flags every segment when the limit is 0.0001 lower', () => {
    const limit = 0.5 - 2 * SLOPE_TOLERANCE;
    const measured = measurePolyline(ramp, line, { maxRunning: limit, maxCross: 1 });
    expect(measured.runningSegments).toEqual([0, 1, 2]);
  });
});

function catalogWith(id: string, change: (entry: CatalogItem) => CatalogItem): CatalogIndex {
  const entry = catalogIndex.get(id);
  if (entry === undefined) throw new Error(`${id} is in the catalog`);
  return new Map([...catalogIndex, [id, change(entry)]]);
}

const gravelPath: PathInput = {
  id: 'walk',
  surface: 'gravel',
  widthM: 2,
  points: [
    { x: 10, y: 30 },
    { x: 30, y: 30 },
  ],
};

describe('measureFootprintGrades and paths', () => {
  it('leaves paths to the path slope check even when their entry sets a grade limit', () => {
    const catalog = catalogWith('path-gravel', (entry) => ({ ...entry, maxGrade: slope(0.05) }));
    const heightmap = makeRampHeightmap({ width: 60, height: 60, gradeX: 0.08 });
    const document = designOf({ paths: [gravelPath] });
    const footprints = designFootprints({ document, catalog, grid: gridOf(heightmap) });
    expect(measureFootprintGrades(heightmap, footprints)).toEqual([]);
  });
});

describe('designFootprints path flags', () => {
  it('marks only the path the document calls existing as existing', () => {
    const grid = gridOf(makeFlatHeightmap({ width: 40, height: 40 }));
    const document = designOf({
      paths: [
        { ...gravelPath, id: 'old', existing: true },
        { ...gravelPath, id: 'new' },
      ],
    });
    const footprints = designFootprints({ document, catalog: catalogIndex, grid });
    expect(footprints.map((footprint) => footprint.existing)).toEqual([true, false]);
  });
});

describe('forbiddenZoneHits with only locked elements', () => {
  it('reports no hits', () => {
    const grid = gridOf(makeFlatHeightmap({ width: 20, height: 20 }));
    const document = designOf({
      items: [{ ...itemAt('old-bench', 'bench', 5, 5), locked: true }],
      zones: [{ id: 'z', kind: 'forbidden', polygon: rectangle(0, 0, 10, 10), label: 'Easement' }],
    });
    const footprints = designFootprints({ document, catalog: catalogIndex, grid });
    expect(forbiddenZoneHits(footprints, document.zones)).toEqual([]);
  });
});

describe('computeMetrics garden plots', () => {
  it('counts plots in gardens only, not modules on another area', () => {
    const catalog = catalogWith('plaza', (entry) =>
      entry.geometryKind === 'area'
        ? { ...entry, footprint: { ...entry.footprint, module: gardenEntry().footprint.module } }
        : entry,
    );
    const result = computeMetrics({
      document: designOf({
        areas: [{ id: 'p', catalogId: 'plaza', polygon: rectangle(5, 5, 25, 25), locked: false }],
      }),
      parcel: rectangleParcel(40, 40),
      parameters: parametersWith(),
      catalog,
      heightmap: makeFlatHeightmap({ width: 40, height: 40 }),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.totals.gardenPlots).toBe(0);
  });
});
