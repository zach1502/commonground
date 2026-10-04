import { describe, expect, it } from 'vitest';

import {
  CONTEXT_BIKEWAY_WIDTH_M,
  CONTEXT_BUFFER_M,
  CONTEXT_LAYER_DEFAULTS,
  CONTEXT_SIDEWALK_WIDTH_M,
  CONTEXT_STREET_WIDTH_M,
} from '../constants.js';

import {
  CONTEXT_FEATURE_KINDS,
  compareContextFeatures,
  contextFeatureSchema,
  siteContextSchema,
  type ContextFeature,
} from './context-feature.js';

const source = { name: 'Vancouver Open Data', datasetId: 'public-streets' };

const street = {
  id: 'street-1',
  kind: 'street',
  name: 'W 7th Ave',
  source,
  geometry: {
    type: 'line',
    points: [
      { x: -10, y: 90 },
      { x: 190, y: 90 },
    ],
    widthM: 8,
  },
};

const parking = {
  id: 'parking-1',
  kind: 'parking',
  source: { ...source, datasetId: 'parking-meters' },
  geometry: {
    type: 'polygon',
    ring: [
      { x: 0, y: -6 },
      { x: 6, y: -6 },
      { x: 6, y: -3.6 },
    ],
  },
};

const busStop = {
  id: 'stop-50001',
  kind: 'busStop',
  name: 'Westbound W Broadway @ Columbia St',
  source: { name: 'TransLink GTFS', datasetId: 'stops' },
  geometry: { type: 'point', position: { x: 20, y: -120 } },
};

describe('contextFeatureSchema', () => {
  it('accepts a line, a polygon and a point', () => {
    expect(contextFeatureSchema.parse(street).geometry.type).toBe('line');
    expect(contextFeatureSchema.parse(parking).geometry.type).toBe('polygon');
    expect(contextFeatureSchema.parse(busStop).geometry.type).toBe('point');
  });

  it('allows a feature with no name', () => {
    expect(contextFeatureSchema.parse(parking).name).toBeUndefined();
  });

  it('refuses a line with one point', () => {
    const geometry = { ...street.geometry, points: [{ x: 0, y: 0 }] };
    expect(contextFeatureSchema.safeParse({ ...street, geometry }).success).toBe(false);
  });

  it('refuses a polygon with two points', () => {
    const geometry = { type: 'polygon', ring: parking.geometry.ring.slice(0, 2) };
    expect(contextFeatureSchema.safeParse({ ...parking, geometry }).success).toBe(false);
  });

  it('refuses a line with no positive width', () => {
    const geometry = { ...street.geometry, widthM: 0 };
    expect(contextFeatureSchema.safeParse({ ...street, geometry }).success).toBe(false);
  });

  it('refuses a coordinate that is not finite', () => {
    const geometry = { type: 'point', position: { x: Number.NaN, y: 0 } };
    expect(contextFeatureSchema.safeParse({ ...busStop, geometry }).success).toBe(false);
  });

  it('refuses a kind outside the five layers', () => {
    expect(contextFeatureSchema.safeParse({ ...street, kind: 'crosswalk' }).success).toBe(false);
  });

  it('refuses a feature with no source dataset', () => {
    const noDataset = { ...street, source: { name: source.name, datasetId: '' } };
    expect(contextFeatureSchema.safeParse(noDataset).success).toBe(false);
  });
});

describe('siteContextSchema', () => {
  it('holds the features, the buffer and when they were recorded', () => {
    const context = siteContextSchema.parse({
      features: [street, busStop],
      bufferM: 300,
      recordedAt: '2026-10-03T12:00:00Z',
    });
    expect(context.features).toHaveLength(2);
  });

  it('refuses a negative buffer', () => {
    const context = { features: [], bufferM: -1, recordedAt: '2026-10-03T12:00:00Z' };
    expect(siteContextSchema.safeParse(context).success).toBe(false);
  });
});

describe('compareContextFeatures', () => {
  it('sorts by layer order, then by id', () => {
    const features: ContextFeature[] = [
      busStop,
      parking,
      street,
      { ...street, id: 'street-0' },
    ].map((feature) => contextFeatureSchema.parse(feature));
    const sorted = [...features].sort(compareContextFeatures).map((feature) => feature.id);
    expect(sorted).toEqual(['street-0', 'street-1', 'stop-50001', 'parking-1']);
  });
});

describe('context layer constants', () => {
  it('lists the five layers in drawing order', () => {
    expect(CONTEXT_FEATURE_KINDS).toEqual(['street', 'sidewalk', 'busStop', 'parking', 'bikeway']);
  });

  it('turns streets, sidewalks and bus stops on, and parking and bikeways off', () => {
    expect(CONTEXT_LAYER_DEFAULTS).toEqual({
      street: 'on',
      sidewalk: 'on',
      busStop: 'on',
      parking: 'off',
      bikeway: 'off',
    });
  });

  it('keeps the widths and buffer from the plan', () => {
    expect(CONTEXT_BUFFER_M).toBe(300);
    expect(CONTEXT_SIDEWALK_WIDTH_M).toBe(1.8);
    expect(CONTEXT_BIKEWAY_WIDTH_M).toBe(1.5);
    expect(CONTEXT_STREET_WIDTH_M).toEqual({ fallback: 8, min: 6, max: 12, verge: 8, searchM: 15 });
  });
});
