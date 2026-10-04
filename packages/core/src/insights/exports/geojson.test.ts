import { describe, expect, it } from 'vitest';

import { designOf, itemAt } from '../../metrics/fixtures/design-builders.js';

import { EXPORT_INPUT } from './export-fixtures.js';
import { geoJsonChunks, localToLonLat } from './geojson.js';
import { joinChunks } from './top-designs.js';

interface Feature {
  type: string;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

// Built inside each test, so a writer that throws fails that test instead of the whole file.
const readCollection = () =>
  JSON.parse(joinChunks(geoJsonChunks(EXPORT_INPUT))) as {
    type: string;
    features: Feature[];
  };

describe('geoJsonChunks', () => {
  it('writes a FeatureCollection with one feature per element', () => {
    expect(readCollection().type).toBe('FeatureCollection');
    // d1: tree, bench, path; d2: garden.
    expect(readCollection().features).toHaveLength(4);
  });

  it('gives every feature a geometry and properties', () => {
    readCollection().features.forEach((feature) => {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).not.toBeNull();
      expect(feature.properties).toMatchObject({ rank: expect.any(Number) as number });
    });
  });

  it('writes points, lines and closed polygons', () => {
    expect(readCollection().features.map((feature) => feature.geometry?.type)).toEqual([
      'Point',
      'Point',
      'LineString',
      'Polygon',
    ]);
    const polygon = readCollection().features[3]?.geometry?.coordinates as number[][][];
    const ring = polygon[0] ?? [];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('names the design, rank and category on each feature', () => {
    expect(readCollection().features[0]?.properties).toEqual({
      rank: 1,
      designId: 'd1',
      title: 'Shade, "quiet" corner',
      elementId: 't1',
      kind: 'item',
      category: 'tree',
      catalogId: 'garry-oak',
    });
  });
});

describe('localToLonLat', () => {
  const origin = { lat: 49.2636, lon: -123.0995 };

  it('returns the origin for (0, 0) and moves north and east by metres', () => {
    expect(localToLonLat(origin, { x: 0, y: 0 })).toEqual([-123.0995, 49.2636]);
    const [lon, lat] = localToLonLat(origin, { x: 100, y: 111.32 });
    expect(lat - origin.lat).toBeCloseTo(0.001, 5);
    expect(lon - origin.lon).toBeCloseTo(100 / (111_320 * Math.cos((49.2636 * Math.PI) / 180)), 5);
  });
});

describe('geoJsonChunks features', () => {
  it('places each point at its longitude and latitude', () => {
    const [tree] = readCollection().features;
    const origin = EXPORT_INPUT.parcel.origin;
    expect(tree?.geometry?.coordinates).toEqual(localToLonLat(origin, { x: 5, y: 5 }));
  });

  it('names the element, kind and catalog entry of every feature', () => {
    const elements = readCollection().features.map((feature) => {
      const { elementId, kind, category, catalogId } = feature.properties ?? {};
      return [elementId, kind, category, catalogId];
    });
    expect(elements).toEqual([
      ['t1', 'item', 'tree', 'garry-oak'],
      ['b1', 'item', 'seating', 'bench'],
      ['p1', 'path', 'path', 'path-gravel'],
      ['g1', 'area', 'garden', 'community-garden'],
    ]);
  });

  it('files an element the catalog does not know under amenity', () => {
    const [first] = EXPORT_INPUT.designs;
    if (first === undefined) throw new Error('fixture has designs');
    const unknown = designOf({ items: [itemAt('x', 'not-in-catalog', 1, 1)] });
    const design = { ...first, design: { ...first.design, document: unknown } };
    const text = joinChunks(geoJsonChunks({ ...EXPORT_INPUT, designs: [design] }));
    const parsed = JSON.parse(text) as { features: Feature[] };
    expect(parsed.features[0]?.properties?.category).toBe('amenity');
  });
});
