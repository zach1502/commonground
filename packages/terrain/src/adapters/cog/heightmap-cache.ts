import { createHash } from 'node:crypto';

import type { GeoJsonPolygon } from '../../geojson.js';
import { encodeHeightmap } from '../../heightmap-codec.js';
import type { CacheStore } from '../../ports/cache-store.js';
import type { TerrainResult } from '../../ports/terrain-provider.js';
import { readStoredHeightmap, writeStoredHeightmap } from '../../stored-heightmap.js';

const CACHE_PREFIX = 'terrain-cache';

export interface HeightmapCacheKey {
  readonly collection: string;
  readonly polygonWgs84: GeoJsonPolygon;
  readonly resolutionM: number;
}

function keyFor(key: HeightmapCacheKey): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([key.polygonWgs84.coordinates, key.resolutionM]))
    .digest('hex');
  return `${CACHE_PREFIX}/${key.collection}/${digest}`;
}

/** Reads a cached grid. A missing or unreadable entry counts as a miss. */
export async function readCachedHeightmap(
  cache: CacheStore,
  key: HeightmapCacheKey,
): Promise<TerrainResult | undefined> {
  const read = await readStoredHeightmap(cache, keyFor(key));
  return read.kind === 'found' ? read.result : undefined;
}

export async function writeCachedHeightmap(
  cache: CacheStore,
  key: HeightmapCacheKey,
  entry: { result: TerrainResult; frameOrigin: { lat: number; lon: number } },
): Promise<void> {
  const stored = encodeHeightmap({ ...entry, polygonWgs84: key.polygonWgs84 });
  await writeStoredHeightmap(cache, keyFor(key), stored);
}
