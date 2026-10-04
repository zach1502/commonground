import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';

import {
  createTerrainProvider,
  encodeHeightmap,
  geoJsonPolygonSchema,
  InMemorySiteContextProvider,
  localFrameFor,
  readStoredHeightmap,
  truckLoadsForDepths,
  writeStoredHeightmap,
} from './index.js';

describe('truckLoadsForDepths', () => {
  it('rounds partial loads up and counts cut and fill alike', () => {
    expect(truckLoadsForDepths([])).toBe(0);
    expect(truckLoadsForDepths([4, -4])).toBe(1);
    expect(truckLoadsForDepths([5, 5, 1])).toBe(2);
  });
});

describe('package entry', () => {
  it('builds the terrain provider named in config', () => {
    const fetch = () => Promise.reject(new Error('offline'));
    expect(createTerrainProvider(loadConfig({}), { fetch }).name).toBe('static');
  });

  it('exports the stored heightmap reader and writer for apps/api', () => {
    expect(typeof encodeHeightmap).toBe('function');
    expect(typeof readStoredHeightmap).toBe('function');
    expect(typeof writeStoredHeightmap).toBe('function');
  });

  it('exports the in-memory site context provider for API tests', () => {
    const provider = new InMemorySiteContextProvider({ features: [], recordedAt: 'unused' });
    expect(provider.name).toBe('memory');
  });
});

describe('local frame export', () => {
  it('puts the bounding box minimum of a polygon at local (0, 0) and back', () => {
    const polygon = geoJsonPolygonSchema.parse({
      type: 'Polygon',
      coordinates: [
        [
          [-123.1, 49.26],
          [-123.09, 49.26],
          [-123.09, 49.27],
          [-123.1, 49.26],
        ],
      ],
    });
    const frame = localFrameFor(polygon);
    const origin = frame.toLocal([-123.1, 49.26]);
    expect(origin.x).toBeCloseTo(0, 3);
    expect(origin.y).toBeCloseTo(0, 3);
    const [lon, lat] = frame.toWgs84({ x: 100, y: 100 });
    const back = frame.toLocal([lon, lat]);
    expect(back.x).toBeCloseTo(100, 3);
  });
});
