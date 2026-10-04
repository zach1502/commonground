import { mkdir, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { err, ok, siteContextSchema, type Result, type SiteContext } from '@parkshape/core';

import { geoJsonPolygonSchema, type GeoJsonPolygon } from '../../geojson.js';
import type { HttpError } from '../../ports/http.js';

import { fileIn, readOrError, type FixtureDir } from './fixture-files.js';

const CONTEXT_FILE = 'context.json';
const JSON_INDENT = 2;

/** context.json: the context around one recorded parcel, in that parcel's local frame. */
export const siteContextFileSchema = z.object({
  format: z.literal('parkshape-site-context'),
  version: z.literal(1),
  parkName: z.string(),
  parcel: z.object({ polygonWgs84: geoJsonPolygonSchema }),
  context: siteContextSchema,
});

export type SiteContextFile = z.output<typeof siteContextFileSchema>;

export async function readSiteContextFixture(
  dir: FixtureDir,
): Promise<Result<SiteContextFile, HttpError>> {
  const file = fileIn(dir, CONTEXT_FILE);
  const text = await readOrError(file);
  if (!text.ok) return text;
  const parsed = siteContextFileSchema.safeParse(JSON.parse(text.value.toString('utf8')));
  return parsed.success
    ? ok(parsed.data)
    : err({ kind: 'invalidResponse', url: file.href, issues: z.prettifyError(parsed.error) });
}

export async function writeSiteContextFixture(
  dir: FixtureDir,
  site: { parkName: string; polygonWgs84: GeoJsonPolygon; context: SiteContext },
): Promise<URL> {
  const body = {
    format: 'parkshape-site-context',
    version: 1,
    parkName: site.parkName,
    parcel: { polygonWgs84: site.polygonWgs84 },
    context: site.context,
  };
  const file = fileIn(dir, CONTEXT_FILE);
  await mkdir(fileIn(dir, '.'), { recursive: true });
  await writeFile(file, `${JSON.stringify(body, null, JSON_INDENT)}\n`);
  return file;
}
