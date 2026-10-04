import type { MapStyle } from '../ports/map-tile-source.js';

/** A WGS84 position, longitude first, as GeoJSON orders it. */
export type LonLat = readonly [lon: number, lat: number];

export interface MapMarker {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly locked: 'locked' | 'unlocked';
}

type Position = [number, number];
type Geometry =
  | { readonly type: 'Point'; readonly coordinates: Position }
  | { readonly type: 'LineString'; readonly coordinates: Position[] }
  | { readonly type: 'Polygon'; readonly coordinates: Position[][] };

export interface MapFeature {
  readonly type: 'Feature';
  readonly geometry: Geometry;
  readonly properties: Readonly<Record<string, string>>;
}

export interface MapFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: MapFeature[];
}

const STYLE_VERSION = 8;

export interface BasemapStyle {
  readonly version: typeof STYLE_VERSION;
  readonly sources: Record<string, unknown>;
  readonly layers: Record<string, unknown>[];
}

const BASEMAP = 'basemap';
const MIN_DRAFT_LINE = 2;

const TOKEN_PREFIX = '--';

/** A solid colour may name a design token, such as --domain-terrain-meadow; this reads it. */
export function resolveTokens(style: MapStyle, readToken: (token: string) => string): MapStyle {
  if (style.kind !== 'solid' || !style.colour.startsWith(TOKEN_PREFIX)) return style;
  return { ...style, colour: readToken(style.colour) };
}

/** The MapLibre style for a basemap; overlays are added on top once the map loads. */
export function toMaplibreStyle(style: MapStyle): BasemapStyle {
  if (style.kind === 'solid') {
    return {
      version: STYLE_VERSION,
      sources: {},
      layers: [{ id: BASEMAP, type: 'background', paint: { 'background-color': style.colour } }],
    };
  }
  return {
    version: STYLE_VERSION,
    sources: {
      [BASEMAP]: {
        type: 'raster',
        tiles: [...style.tiles],
        tileSize: style.tileSizePx,
        maxzoom: style.maxZoom,
        attribution: style.attribution,
      },
    },
    layers: [{ id: BASEMAP, type: 'raster', source: BASEMAP }],
  };
}

const position = ([lon, lat]: LonLat): Position => [lon, lat];

function collection(features: MapFeature[]): MapFeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** The ring with its first position repeated at the end, as GeoJSON wants. */
export function closeRing(ring: readonly LonLat[]): LonLat[] {
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first === undefined || last === undefined) return [];
  const closed = first[0] === last[0] && first[1] === last[1];
  return closed ? [...ring] : [...ring, first];
}

export function outlineCollection(ring: readonly LonLat[] | null): MapFeatureCollection {
  if (ring === null || ring.length === 0) return collection([]);
  return collection([
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [closeRing(ring).map(position)] },
      properties: {},
    },
  ]);
}

/** Vertices placed so far, joined by a line once there are two. */
export function draftCollection(vertices: readonly LonLat[]): MapFeatureCollection {
  const points: MapFeature[] = vertices.map((vertex) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: position(vertex) },
    properties: {},
  }));
  if (vertices.length < MIN_DRAFT_LINE) return collection(points);
  const line: MapFeature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: vertices.map(position) },
    properties: {},
  };
  return collection([...points, line]);
}

export function markerCollection(markers: readonly MapMarker[]): MapFeatureCollection {
  return collection(
    markers.map((marker) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position(marker.lonLat) },
      properties: { id: marker.id, locked: marker.locked },
    })),
  );
}

/** South-west and north-east corners around a ring. */
export function boundsOf(ring: readonly LonLat[]): [Position, Position] {
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
