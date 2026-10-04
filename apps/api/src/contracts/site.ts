import { z } from '@hono/zod-openapi';

const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;
// A closed ring repeats its first position, so a triangle needs 4 positions.
const MIN_RING_POSITIONS = 4;
const MIN_RESOLUTION_M = 0.5;
const MAX_RESOLUTION_M = 30;
const MAX_PARK_NAME_LENGTH = 120;

const lonLatSchema = z
  .tuple([
    z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
    z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
  ])
  .openapi('LonLat', { description: 'A WGS84 position, longitude first.' });

export const geoJsonPolygonContract = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(lonLatSchema).min(MIN_RING_POSITIONS)).min(1),
  })
  .openapi('GeoJsonPolygon', { description: 'A GeoJSON Polygon in WGS84; ring 0 is the outline.' });

const localPointContract = z.object({ x: z.number(), y: z.number() });

export const terrainBodySchema = z
  .object({
    polygonWgs84: geoJsonPolygonContract,
    resolutionM: z.number().min(MIN_RESOLUTION_M).max(MAX_RESOLUTION_M),
  })
  .openapi('TerrainBody');

export const terrainProviderSchema = z
  .enum(['hrdem', 'mrdem', 'static'])
  .openapi('TerrainProviderName', { description: 'The provider that supplied the elevations.' });

export const terrainResultSchema = z
  .object({
    heightmapRef: z.string(),
    provider: terrainProviderSchema,
    source: z.object({ name: z.string(), licence: z.string(), url: z.string() }),
    crs: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    resolutionM: z.number().positive(),
  })
  .openapi('TerrainResult');

export const siteFeaturesBodySchema = z
  .object({
    parkName: z.string().min(1).max(MAX_PARK_NAME_LENGTH).optional(),
    polygonWgs84: geoJsonPolygonContract.optional(),
  })
  .refine((body) => body.parkName !== undefined || body.polygonWgs84 !== undefined, {
    message: 'Give a park name or an outline.',
  })
  .openapi('SiteFeaturesBody');

const featureSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['tree', 'garden', 'building', 'sportsField', 'other']),
    catalogId: z.string().nullable(),
    name: z.string().nullable(),
    dbhCm: z.number().nullable(),
    plots: z.number().int().nullable(),
    suggestedLocked: z.boolean(),
    source: z.string(),
    datasetId: z.string(),
    reviewOnly: z.boolean(),
    position: localPointContract.nullable(),
    polygon: z.array(localPointContract).nullable(),
    lonLat: lonLatSchema,
  })
  .openapi('ProposedFeature', { description: 'An existing thing on the site, in local metres.' });

export const siteFeaturesResultSchema = z
  .object({
    parkName: z.string().nullable(),
    parcel: z.object({
      polygonWgs84: geoJsonPolygonContract,
      polygonLocal: z.array(localPointContract),
      origin: z.object({ lat: z.number(), lon: z.number() }),
    }),
    features: z.array(featureSchema),
  })
  .openapi('SiteFeaturesResult');

// A line needs 2 points and a ring 3, as the core context schema says.
const LINE_MIN_POINTS = 2;
const RING_MIN_POINTS = 3;

const contextGeometrySchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('line'),
      points: z.array(localPointContract).min(LINE_MIN_POINTS),
      widthM: z.number().positive(),
    }),
    z.object({
      type: z.literal('polygon'),
      ring: z.array(localPointContract).min(RING_MIN_POINTS),
    }),
    z.object({ type: z.literal('point'), position: localPointContract }),
  ])
  .openapi('ContextGeometry', {
    description: 'Local metres from the parcel box minimum; context reaches past the parcel.',
  });

const contextFeatureContract = z
  .object({
    id: z.string(),
    kind: z.enum(['street', 'sidewalk', 'busStop', 'parking', 'bikeway']),
    name: z.string().optional(),
    source: z.object({ name: z.string(), datasetId: z.string() }),
    geometry: contextGeometrySchema,
  })
  .openapi('ContextFeature', { description: 'A street, sidewalk, bus stop, stall or bikeway.' });

export const siteContextResultSchema = z
  .object({
    features: z.array(contextFeatureContract),
    bufferM: z.number().nonnegative(),
    recordedAt: z.iso.datetime(),
  })
  .openapi('SiteContext', {
    description: 'What lies within bufferM of the parcel box, sorted by layer and then id.',
  });

export type TerrainBody = z.infer<typeof terrainBodySchema>;
export type TerrainResultBody = z.infer<typeof terrainResultSchema>;
export type SiteFeaturesBody = z.infer<typeof siteFeaturesBodySchema>;
export type SiteFeaturesResultBody = z.infer<typeof siteFeaturesResultSchema>;
export type FeatureBody = z.infer<typeof featureSchema>;
