import { z } from 'zod';

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
// A closed ring repeats its first position, so a triangle needs 4 positions.
const MIN_RING_POSITIONS = 4;

/** A WGS84 position as GeoJSON orders it: longitude first, then latitude. */
export type LonLat = readonly [lon: number, lat: number];

/** A GeoJSON Polygon in WGS84. The first ring is the outer boundary. */
export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly LonLat[])[];
}

const positionSchema = z
  .tuple(
    [
      z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
      z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
    ],
    z.number(),
  )
  .transform((position): LonLat => [position[0], position[1]]);

export const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(positionSchema).min(MIN_RING_POSITIONS)).min(1),
});

/** The outer ring of a polygon. The schema guarantees it has at least 4 positions. */
export function outerRing(polygon: GeoJsonPolygon): readonly LonLat[] {
  return polygon.coordinates[0] ?? [];
}

export interface LonLatBounds {
  readonly minLon: number;
  readonly minLat: number;
  readonly maxLon: number;
  readonly maxLat: number;
}

export function lonLatBounds(polygon: GeoJsonPolygon): LonLatBounds {
  const ring = outerRing(polygon);
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
}
