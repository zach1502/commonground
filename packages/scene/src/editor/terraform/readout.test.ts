import { describe, expect, it } from 'vitest';

import { contextFor } from '../actions/test-context.js';
import { docOf } from '../test-fixtures.js';

import { formatReadout, terraformReadout } from './readout.js';

describe('terraformReadout', () => {
  it('reports zero earthworks for an ungraded design', () => {
    const measure = terraformReadout(contextFor(docOf()), docOf());
    expect(measure.cut).toBe(0);
    expect(measure.fill).toBe(0);
    expect(measure.net).toBe(0);
  });

  it('reports fill volume once terrain is raised', () => {
    const ctx = contextFor(docOf());
    const graded = docOf({ gradeDelta: { cells: [{ x: 10, y: 10, deltaM: 2 }] } });
    const measure = terraformReadout(ctx, graded);
    expect(measure.fill).toBeCloseTo(2, 6);
    expect(measure.truckTrips).toBeGreaterThan(0);
  });
});

describe('formatReadout', () => {
  it('formats volumes, truck trips and disturbance through the core formatters', () => {
    const text = formatReadout({
      cut: 0,
      fill: 2,
      net: 2,
      truckTrips: 1,
      disturbedPercent: 0,
      deviationCells: 0,
      largestDeviationM: 0,
      rootZoneHits: [],
      noGradeHits: [],
    });
    expect(text.fill).toBe('2 m³');
    expect(text.trucks).toBe('1 truck trip');
    expect(text.disturbed).toBe('0%');
  });
});
