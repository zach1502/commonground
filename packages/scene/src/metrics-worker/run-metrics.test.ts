import { describe, expect, it } from 'vitest';

import { catalogIndex, modulePlotCount } from '@parkshape/core';

import {
  gardenRequestFixture,
  RECORDED_PLOTS,
  recordedGarden,
  requestFixture,
} from './metrics-fixtures.js';
import { runMetrics, toRequestMessage } from './run-metrics.js';

describe('toRequestMessage', () => {
  it('copies the elevations so the source buffer is not detached by a transfer', () => {
    const request = requestFixture();
    const { message, transfer } = toRequestMessage(3, request);
    expect(message.requestId).toBe(3);
    expect(message.heightmap.elevations).not.toBe(request.heightmap.elevations);
    expect(Array.from(message.heightmap.elevations)).toEqual(
      Array.from(request.heightmap.elevations),
    );
    expect(transfer).toEqual([message.heightmap.elevations.buffer]);
    expect(request.heightmap.elevations.byteLength).toBeGreaterThan(0);
  });
});

describe('runMetrics', () => {
  it('rebuilds the heightmap and returns a report', () => {
    const { message } = toRequestMessage(1, requestFixture());
    const result = runMetrics(message, catalogIndex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.constraints.canopy.status).toBe('warn');
  });
});

const SHIFT_M = 2;

describe('runMetrics with the baseline', () => {
  function gardenPlots(shiftM: number): number {
    const { message } = toRequestMessage(1, gardenRequestFixture(shiftM));
    const result = runMetrics(message, catalogIndex);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value.totals.gardenPlots;
  }

  it('carries the baseline to the worker', () => {
    const request = gardenRequestFixture(0);
    expect(toRequestMessage(1, request).message.baseline).toBe(request.baseline);
  });

  it('counts the recorded plots for the garden as it is today', () => {
    expect(gardenPlots(0)).toBe(RECORDED_PLOTS);
  });

  it('fits plots once the garden moves', () => {
    const entry = catalogIndex.get('community-garden');
    if (entry?.geometryKind !== 'area') throw new Error('community-garden is an area');
    const fitted = modulePlotCount(entry, recordedGarden(SHIFT_M).polygon);
    expect(fitted).not.toBe(RECORDED_PLOTS);
    expect(gardenPlots(SHIFT_M)).toBe(fitted);
  });
});
