import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  catalogIdSchema,
  err,
  localPointSchema,
  ok,
  polygonSchema,
  type Result,
} from '@parkshape/core';

import { geoJsonPolygonSchema } from '../../geojson.js';
import {
  decodeHeightmap,
  HEIGHTMAP_DATA_FILE,
  parseHeightmapHeader,
  type HeightmapHeader,
  type StoredHeightmap,
} from '../../heightmap-codec.js';
import type { HttpError } from '../../ports/http.js';
import type { SiteFeatures } from '../../ports/site-features-provider.js';
import type { TerrainResult } from '../../ports/terrain-provider.js';

const HEADER_FILE = 'heightmap.json';
const FEATURES_FILE = 'features.json';
const JSON_INDENT = 2;

/** The recorded Jonathan Rogers Park site that the static adapters serve by default. */
export const JONATHAN_ROGERS_FIXTURE_DIR = new URL(
  '../../../fixtures/jonathan-rogers/',
  import.meta.url,
);

export type FixtureDir = URL | string;

export function fileIn(dir: FixtureDir, name: string): URL {
  const base = typeof dir === 'string' ? pathToFileURL(dir.endsWith('/') ? dir : `${dir}/`) : dir;
  return new URL(name, base);
}

export async function readOrError(file: URL): Promise<Result<Buffer, HttpError>> {
  try {
    return ok(await readFile(file));
  } catch (cause) {
    return err({
      kind: 'network',
      url: file.href,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export interface HeightmapFixture {
  readonly header: HeightmapHeader;
  readonly result: TerrainResult;
}

export async function readHeightmapFixture(
  dir: FixtureDir,
): Promise<Result<HeightmapFixture, HttpError>> {
  const headerText = await readOrError(fileIn(dir, HEADER_FILE));
  if (!headerText.ok) return headerText;
  const header = parseHeightmapHeader(JSON.parse(headerText.value.toString('utf8')));
  if (!header.ok) return header;
  const bytes = await readOrError(fileIn(dir, header.value.dataFile));
  if (!bytes.ok) return bytes;
  const decoded = decodeHeightmap(header.value, new Uint8Array(bytes.value));
  return decoded.ok ? ok({ header: header.value, result: decoded.value }) : decoded;
}

export async function writeHeightmapFixture(
  dir: FixtureDir,
  stored: StoredHeightmap,
): Promise<void> {
  await mkdir(fileIn(dir, '.'), { recursive: true });
  await writeFile(
    fileIn(dir, HEADER_FILE),
    `${JSON.stringify(stored.header, null, JSON_INDENT)}\n`,
  );
  await writeFile(fileIn(dir, HEIGHTMAP_DATA_FILE), stored.bytes);
}

const provenanceSchema = z.object({
  source: z.string().min(1),
  datasetId: z.string().min(1),
  recordId: z.string().optional(),
  licence: z.string().optional(),
  reviewOnly: z.boolean().optional(),
});

const attributesSchema = z.object({
  name: z.string().optional(),
  species: z.string().optional(),
  dbhCm: z.number().optional(),
  heightRangeM: z.tuple([z.number(), z.number()]).optional(),
  crownRadiusM: z.number().optional(),
  crownRadiusMatureM: z.number().optional(),
  plots: z.number().optional(),
  approximatePosition: z.boolean().optional(),
});

const featureBase = {
  kind: z.enum(['tree', 'garden', 'building', 'sportsField', 'other']),
  catalogId: catalogIdSchema.optional(),
  attributes: attributesSchema,
  suggestedLocked: z.boolean(),
  provenance: provenanceSchema,
};

const featureSchema = z.union([
  z.object({ ...featureBase, position: localPointSchema }),
  z.object({ ...featureBase, polygon: polygonSchema }),
]);

export const siteFeaturesFileSchema = z.object({
  format: z.literal('parkshape-site-features'),
  version: z.literal(1),
  parkName: z.string(),
  parcel: z.object({
    polygonWgs84: geoJsonPolygonSchema,
    polygonLocal: polygonSchema,
    origin: z.object({ lat: z.number(), lon: z.number() }),
  }),
  features: z.array(featureSchema),
});

export type SiteFeaturesFile = z.output<typeof siteFeaturesFileSchema>;

export async function readSiteFeaturesFixture(
  dir: FixtureDir,
): Promise<Result<SiteFeaturesFile, HttpError>> {
  const file = fileIn(dir, FEATURES_FILE);
  const text = await readOrError(file);
  if (!text.ok) return text;
  const parsed = siteFeaturesFileSchema.safeParse(JSON.parse(text.value.toString('utf8')));
  return parsed.success
    ? ok(parsed.data)
    : err({ kind: 'invalidResponse', url: file.href, issues: z.prettifyError(parsed.error) });
}

export async function writeSiteFeaturesFixture(
  dir: FixtureDir,
  site: { parkName: string; features: SiteFeatures },
): Promise<void> {
  const body = {
    format: 'parkshape-site-features',
    version: 1,
    parkName: site.parkName,
    parcel: site.features.parcel,
    features: site.features.features,
  };
  await mkdir(fileIn(dir, '.'), { recursive: true });
  await writeFile(fileIn(dir, FEATURES_FILE), `${JSON.stringify(body, null, JSON_INDENT)}\n`);
}
