import { z } from 'zod';

import { err, ok, type Result } from '@parkshape/core';

import { geoJsonPolygonSchema, type GeoJsonPolygon } from './geojson.js';
import type { HttpError } from './ports/http.js';
import type { TerrainResult } from './ports/terrain-provider.js';

const FLOAT32_BYTES = 4;
const LITTLE_ENDIAN = true;
export const HEIGHTMAP_DATA_FILE = 'heightmap.bin';

const pointSchema = z.object({ x: z.number(), y: z.number() });

/** The JSON half of a stored heightmap. The elevations sit beside it as raw float32 bytes. */
export const heightmapHeaderSchema = z.object({
  format: z.literal('parkshape-heightmap'),
  version: z.literal(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  resolutionM: z.number().positive(),
  originLocal: pointSchema,
  /** WGS84 position of local (0, 0); rebuilds the frame with localFrameFor(polygonWgs84). */
  frameOrigin: z.object({ lat: z.number(), lon: z.number() }),
  polygonWgs84: geoJsonPolygonSchema,
  crs: z.string(),
  source: z.object({ name: z.string(), licence: z.string(), url: z.string() }),
  dataFile: z.string(),
  sampleType: z.literal('float32le'),
  rowOrder: z.literal('south-to-north'),
});

export type HeightmapHeader = z.output<typeof heightmapHeaderSchema>;

export interface StoredHeightmap {
  readonly header: HeightmapHeader;
  readonly bytes: Uint8Array;
}

export interface EncodeInput {
  readonly result: TerrainResult;
  readonly polygonWgs84: GeoJsonPolygon;
  readonly frameOrigin: HeightmapHeader['frameOrigin'];
}

export function encodeHeightmap(input: EncodeInput): StoredHeightmap {
  const { heightmap, source, crs } = input.result;
  const bytes = new Uint8Array(heightmap.elevations.length * FLOAT32_BYTES);
  const view = new DataView(bytes.buffer);
  heightmap.elevations.forEach((value, index) => {
    view.setFloat32(index * FLOAT32_BYTES, value, LITTLE_ENDIAN);
  });
  const header: HeightmapHeader = {
    format: 'parkshape-heightmap',
    version: 1,
    width: heightmap.width,
    height: heightmap.height,
    resolutionM: heightmap.resolutionM,
    originLocal: { x: heightmap.originLocal.x, y: heightmap.originLocal.y },
    frameOrigin: input.frameOrigin,
    polygonWgs84: {
      type: 'Polygon',
      coordinates: input.polygonWgs84.coordinates.map((ring) =>
        ring.map(([lon, lat]) => [lon, lat]),
      ),
    },
    crs,
    source: { ...source },
    dataFile: HEIGHTMAP_DATA_FILE,
    sampleType: 'float32le',
    rowOrder: 'south-to-north',
  };
  return { header, bytes };
}

export function parseHeightmapHeader(json: unknown): Result<HeightmapHeader, HttpError> {
  const parsed = heightmapHeaderSchema.safeParse(json);
  return parsed.success
    ? ok(parsed.data)
    : err({
        kind: 'invalidResponse',
        url: 'heightmap.json',
        issues: z.prettifyError(parsed.error),
      });
}

export function decodeHeightmap(
  header: HeightmapHeader,
  bytes: Uint8Array,
): Result<TerrainResult, HttpError> {
  const expected = header.width * header.height * FLOAT32_BYTES;
  if (bytes.byteLength !== expected) {
    return err({
      kind: 'invalidResponse',
      url: header.dataFile,
      issues: `expected ${String(expected)} bytes, got ${String(bytes.byteLength)}`,
    });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const elevations = Float32Array.from({ length: header.width * header.height }, (_, index) =>
    view.getFloat32(index * FLOAT32_BYTES, LITTLE_ENDIAN),
  );
  return ok({
    heightmap: {
      width: header.width,
      height: header.height,
      resolutionM: header.resolutionM,
      originLocal: header.originLocal,
      elevations,
    },
    source: header.source,
    crs: header.crs,
  });
}
