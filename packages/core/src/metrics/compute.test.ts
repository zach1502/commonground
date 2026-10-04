import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import type { ProjectParametersInput } from '../schema/parameters.js';

import { computeMetrics, type MetricsInput } from './compute.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangle,
  rectangleParcel,
  type DesignParts,
  type PathInput,
} from './fixtures/design-builders.js';
import { makeFlatHeightmap, makeRampHeightmap } from './heightmap.js';
import type { MetricsReport } from './report.js';

const bigGarden = {
  id: 'garden',
  catalogId: 'community-garden',
  polygon: rectangle(2, 2, 26, 11),
  locked: false,
};

function inputOf(parts: DesignParts, patch: Partial<MetricsInput> = {}): MetricsInput {
  return {
    document: designOf({ ...parts, areas: [bigGarden, ...(parts.areas ?? [])] }),
    parcel: rectangleParcel(40, 40),
    parameters: parametersWith(),
    catalog: catalogIndex,
    heightmap: makeFlatHeightmap({ width: 40, height: 40 }),
    ...patch,
  };
}

function reportOf(parts: DesignParts, patch: Partial<MetricsInput> = {}): MetricsReport {
  const result = computeMetrics(inputOf(parts, patch));
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const withParameters = (patch: Partial<ProjectParametersInput>) => ({
  parameters: parametersWith(patch),
});

describe('computeMetrics', () => {
  it('reports every constraint and the totals', () => {
    const report = reportOf({ items: [itemAt('t1', 'red-alder', 30, 30)] });
    expect(Object.keys(report.constraints)).toHaveLength(9);
    expect(report.totals.costCad).toBe(800 + 26 * 900);
    expect(report.totals.gardenPlots).toBe(26);
    expect(report.totals.canopyPercent).toBeGreaterThan(0);
    expect(report.constraints.requiredFeatures.status).toBe('ok');
    expect(report.constraints.canopy.status).toBe('warn');
    expect(report.isSubmittable).toBe(true);
  });

  it('fails a design without the required garden plots', () => {
    const smallGarden = { ...bigGarden, polygon: rectangle(2, 2, 14, 11) };
    const result = computeMetrics({ ...inputOf({}), document: designOf({ areas: [smallGarden] }) });
    expect(result.ok && result.value.constraints.requiredFeatures).toMatchObject({
      status: 'fail',
      message: 'Garden areas fit 12 plots. Make them larger to fit 20.',
    });
    expect(result.ok && result.value.isSubmittable).toBe(false);
  });

  it('checks path slopes on the graded terrain', () => {
    const ramp = makeRampHeightmap({ width: 40, height: 40, gradeX: 0.07 });
    const path: PathInput = {
      id: 'p',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 5, y: 20 },
        { x: 35, y: 20 },
      ],
    };
    const report = reportOf({ paths: [path] }, { heightmap: ramp });
    expect(report.constraints.slopes).toMatchObject({
      status: 'warn',
      message: 'Path 1 reaches 7% grade. Accessible paths are 5% or less.',
    });
  });
});

describe('computeMetrics hard and soft constraints', () => {
  it('fails grading in a locked tree root zone when tree protection is hard', () => {
    const tree = { ...itemAt('t1', 'red-alder', 30, 30), locked: true };
    const severity = { ...parametersWith().severity, treeProtection: 'hard' } as const;
    const report = reportOf(
      { items: [tree], cells: [{ x: 31, y: 30, deltaM: -0.5 }] },
      withParameters({ severity }),
    );
    expect(report.constraints.treeProtection.status).toBe('fail');
    expect(report.isSubmittable).toBe(false);
    expect(report.totals).toMatchObject({ cut: 0.5, fill: 0, net: -0.5, truckTrips: 1 });
  });

  it('fails a new element in a forbidden zone from the parameters', () => {
    const zone = {
      id: 'z',
      kind: 'forbidden',
      polygon: rectangle(30, 30, 40, 40),
      label: 'Sewer easement',
    } as const;
    const report = reportOf(
      { items: [itemAt('b1', 'bench', 35, 35)] },
      withParameters({ forbiddenZones: [zone] }),
    );
    expect(report.constraints.forbiddenZones.status).toBe('fail');
  });

  it('counts impervious and water cover', () => {
    const plaza = {
      id: 'plaza',
      catalogId: 'plaza',
      polygon: rectangle(0, 20, 20, 40),
      locked: false,
    };
    const report = reportOf({ areas: [plaza] });
    expect(report.totals.imperviousPercent).toBe(25);
    expect(report.constraints.impervious.status).toBe('ok');
  });
});

describe('computeMetrics input errors', () => {
  it('rejects unknown catalog ids', () => {
    const result = computeMetrics(inputOf({ items: [itemAt('x', 'no-such-item', 1, 1)] }));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'invalidDocument', issues: [{ kind: 'unknownCatalogId', elementId: 'x' }] },
    });
  });

  it('rejects a heightmap with the wrong number of elevations', () => {
    const heightmap = {
      ...makeFlatHeightmap({ width: 40, height: 40 }),
      elevations: new Float32Array(3),
    };
    const result = computeMetrics(inputOf({}, { heightmap }));
    expect(result.ok ? [] : result.error.issues.map((issue) => issue.kind)).toEqual([
      'elevationCount',
    ]);
  });

  it('rejects a path whose surface has no catalog entry', () => {
    const catalog = new Map([...catalogIndex].filter(([id]) => id !== 'path-boardwalk'));
    const path: PathInput = {
      id: 'bw',
      surface: 'boardwalk',
      widthM: 2,
      points: [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
      ],
    };
    const result = computeMetrics(inputOf({ paths: [path] }, { catalog }));
    expect(result).toMatchObject({
      ok: false,
      error: {
        issues: [{ kind: 'unknownPathSurface', elementId: 'bw', catalogId: 'path-boardwalk' }],
      },
    });
  });
});

describe('metric subjects', () => {
  it('reports no subjects for a design with no path, zone, count rule or locked tree', () => {
    const report = reportOf({ items: [itemAt('t1', 'red-alder', 30, 30)] });
    expect(report.subjects).toEqual({ paths: 0, closedZones: 0, countRules: 0, trees: 0 });
  });

  it('counts paths, closed zones, count rules and locked trees as subjects', () => {
    const path: PathInput = {
      id: 'p',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 5, y: 5 },
        { x: 20, y: 5 },
      ],
    };
    const report = reportOf(
      {
        items: [{ ...itemAt('oak', 'garry-oak', 33, 33), locked: true }],
        paths: [path],
        zones: [
          { id: 'z', kind: 'forbidden', polygon: rectangle(30, 30, 36, 36), label: 'Corner' },
        ],
      },
      withParameters({ counts: [{ category: 'seating', max: 2 }] }),
    );
    expect(report.subjects).toEqual({ paths: 1, closedZones: 1, countRules: 1, trees: 1 });
  });
});
