import { z } from 'zod';

import { err, ok, type Result } from '@parkshape/core';

import type { GeoJsonPolygon } from '../../geojson.js';
import type { HttpFetch } from '../../ports/http.js';
import type { TerrainError } from '../../ports/terrain-provider.js';
import { requestJson } from '../http/request-json.js';

const SEARCH_LIMIT = 10;
const TERRAIN_WORDS = /\bdtm\b|terrain/i;
// Surface models include buildings and tree tops; hillshades are pictures, not heights.
const EXCLUDED_WORDS = /dsm|surface|hillshade|shaded|relief/i;
const GEOTIFF_TYPE = /geotiff/i;

const assetSchema = z.object({
  href: z.string(),
  type: z.string().optional(),
  roles: z.array(z.string()).optional(),
  title: z.string().optional(),
});

const itemSchema = z.object({
  id: z.string(),
  properties: z.looseObject({ 'proj:epsg': z.number().int().nullable().optional() }),
  assets: z.record(z.string(), assetSchema),
});

const itemCollectionSchema = z.object({ features: z.array(itemSchema) });

export type StacItem = z.input<typeof itemSchema>;

export interface DtmAsset {
  readonly key: string;
  readonly href: string;
}

function isTerrainCog(key: string, asset: z.output<typeof assetSchema>): boolean {
  const label = `${key} ${asset.title ?? ''}`;
  const isData = asset.roles === undefined || asset.roles.includes('data');
  const isGeotiff =
    asset.type === undefined ? /\.tiff?$/i.test(asset.href) : GEOTIFF_TYPE.test(asset.type);
  return isData && isGeotiff && TERRAIN_WORDS.test(label) && !EXCLUDED_WORDS.test(label);
}

/** The bare-earth elevation asset of a STAC item. A DSM is never returned. */
export function pickDtmAsset(item: StacItem): Result<DtmAsset, TerrainError> {
  const candidates = Object.entries(item.assets)
    .filter(([key, asset]) => isTerrainCog(key, asset))
    .sort(([a], [b]) => Number(b === 'dtm') - Number(a === 'dtm'));
  const [first] = candidates;
  return first === undefined
    ? err({ kind: 'noDtmAsset', itemId: item.id })
    : ok({ key: first[0], href: first[1].href });
}

export interface StacSearch {
  readonly fetch: HttpFetch;
  readonly stacUrl: string;
  readonly collection: string;
  readonly polygonWgs84: GeoJsonPolygon;
}

export interface DtmItem {
  readonly itemId: string;
  readonly asset: DtmAsset;
  /** proj:epsg from the item, when the item states it. */
  readonly epsg: number | undefined;
}

/** Searches the collection for items over the polygon and returns the first with a DTM. */
export async function findDtmItem(search: StacSearch): Promise<Result<DtmItem, TerrainError>> {
  const body = JSON.stringify({
    collections: [search.collection],
    intersects: search.polygonWgs84,
    limit: SEARCH_LIMIT,
  });
  const response = await requestJson({
    fetch: search.fetch,
    url: search.stacUrl,
    init: { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    schema: itemCollectionSchema,
  });
  if (!response.ok) return response;
  let firstError: TerrainError = { kind: 'noCoverage', collection: search.collection };
  for (const item of response.value.features) {
    const asset = pickDtmAsset(item);
    if (asset.ok) {
      return ok({
        itemId: item.id,
        asset: asset.value,
        epsg: item.properties['proj:epsg'] ?? undefined,
      });
    }
    firstError = asset.error;
  }
  return err(firstError);
}
