import { describe, expect, it } from 'vitest';

import {
  boundsOf,
  closeRing,
  draftCollection,
  markerCollection,
  outlineCollection,
  resolveTokens,
  toMaplibreStyle,
} from './map-style.js';

const RING = [
  [-123.109, 49.2646],
  [-123.1069, 49.2646],
  [-123.1069, 49.2639],
] as const;

describe('toMaplibreStyle', () => {
  it('draws a solid style as one background layer with no sources', () => {
    const style = toMaplibreStyle({ kind: 'solid', colour: 'green', attribution: 'Fill' });
    expect(style.sources).toEqual({});
    expect(style.layers).toEqual([
      { id: 'basemap', type: 'background', paint: { 'background-color': 'green' } },
    ]);
  });

  it('draws raster tiles as one raster source and layer with the credit', () => {
    const style = toMaplibreStyle({
      kind: 'raster',
      tiles: ['https://tiles.test/{z}/{x}/{y}.png'],
      tileSizePx: 256,
      maxZoom: 19,
      attribution: 'OSM',
    });
    expect(style.sources.basemap).toMatchObject({
      type: 'raster',
      attribution: 'OSM',
      maxzoom: 19,
    });
    expect(style.layers[0]).toMatchObject({ id: 'basemap', type: 'raster', source: 'basemap' });
  });
});

describe('resolveTokens', () => {
  it('reads a token named as the solid colour and leaves other styles alone', () => {
    const solid = {
      kind: 'solid',
      colour: '--domain-terrain-meadow',
      attribution: 'Fill',
    } as const;
    expect(resolveTokens(solid, () => 'olive')).toEqual({ ...solid, colour: 'olive' });
    const plain = { ...solid, colour: 'green' };
    expect(resolveTokens(plain, () => 'olive')).toBe(plain);
  });
});

describe('GeoJSON builders', () => {
  it('closes a ring once', () => {
    expect(closeRing(RING)).toHaveLength(4);
    expect(closeRing(closeRing(RING))).toHaveLength(4);
  });

  it('builds an empty outline when there is none', () => {
    expect(outlineCollection(null).features).toEqual([]);
    expect(outlineCollection(RING).features[0]?.geometry.type).toBe('Polygon');
  });

  it('draws the draft as points plus a line once it has two vertices', () => {
    expect(draftCollection([RING[0]]).features).toHaveLength(1);
    const types = draftCollection(RING).features.map((feature) => feature.geometry.type);
    expect(types).toEqual(['Point', 'Point', 'Point', 'LineString']);
  });

  it('carries the lock state on each marker', () => {
    const markers = markerCollection([{ id: 't1', lonLat: RING[0], locked: 'locked' }]);
    expect(markers.features[0]?.properties).toEqual({ id: 't1', locked: 'locked' });
  });

  it('finds the bounds of a ring', () => {
    expect(boundsOf(RING)).toEqual([
      [-123.109, 49.2639],
      [-123.1069, 49.2646],
    ]);
  });
});
