import { describe, expect, it } from 'vitest';

import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import type { DesignDocument } from '../schema/design.js';

import { computeMetrics, type MetricsInput } from './compute.js';
import {
  designOf,
  parametersWith,
  rectangle,
  rectangleParcel,
  type AreaInput,
} from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import type { MetricsReport } from './report.js';

const RECORDED_PLOTS = 56;
const SHIFT_M = 2;

const existingGarden: AreaInput = {
  id: 'existing-garden',
  catalogId: 'community-garden',
  polygon: rectangle(2, 2, 26, 11),
  locked: false,
  existing: true,
  recordedPlots: RECORDED_PLOTS,
};

const baseline = designOf({ areas: [existingGarden] });

// The same garden 2 m to the east.
const movedGarden: AreaInput = {
  ...existingGarden,
  polygon: rectangle(2 + SHIFT_M, 2, 26 + SHIFT_M, 11),
};

function reportOf(document: DesignDocument, patch: Partial<MetricsInput> = {}): MetricsReport {
  const result = computeMetrics({
    document,
    baseline,
    parcel: rectangleParcel(40, 40),
    parameters: parametersWith(),
    catalog: catalogIndex,
    heightmap: makeFlatHeightmap({ width: 40, height: 40 }),
    ...patch,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function fittedPlots(garden: AreaInput): number {
  const entry = catalogIndex.get('community-garden');
  if (entry?.geometryKind !== 'area') throw new Error('community-garden is an area');
  return modulePlotCount(entry, garden.polygon);
}

describe('computeMetrics with a recorded garden', () => {
  it('reports the recorded plots for the garden as it is today', () => {
    expect(fittedPlots(existingGarden)).not.toBe(RECORDED_PLOTS);
    expect(reportOf(baseline).totals.gardenPlots).toBe(RECORDED_PLOTS);
  });

  it('fits plots again once the garden moves 2 m', () => {
    const report = reportOf(designOf({ areas: [movedGarden] }));
    expect(report.totals.gardenPlots).toBe(fittedPlots(movedGarden));
  });

  it('fits plots when no baseline is given', () => {
    const report = reportOf(baseline, { baseline: undefined });
    expect(report.totals.gardenPlots).toBe(fittedPlots(existingGarden));
  });

  it('passes the plot minimum on the recorded count', () => {
    const parameters = parametersWith({
      requiredFeatures: [{ category: 'garden', minCount: 1, minPlots: RECORDED_PLOTS }],
    });
    expect(reportOf(baseline, { parameters }).constraints.requiredFeatures.status).toBe('ok');
  });

  it('fails the plot minimum when the recorded count is under it, though more beds would fit', () => {
    const smallRecord = designOf({ areas: [{ ...existingGarden, recordedPlots: 12 }] });
    expect(fittedPlots(existingGarden)).toBeGreaterThanOrEqual(20);
    const report = reportOf(smallRecord, { baseline: smallRecord });
    expect(report.constraints.requiredFeatures).toMatchObject({
      status: 'fail',
      message: 'Garden areas fit 12 plots. Make them larger to fit 20.',
    });
  });
});
