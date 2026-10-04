import { decodeHeightmap, parseHeightmapHeader, type StoredHeightmap } from './heightmap-codec.js';
import type { CacheStore } from './ports/cache-store.js';
import type { TerrainResult } from './ports/terrain-provider.js';

const HEADER_TYPE = 'application/json';
const DATA_TYPE = 'application/octet-stream';

/** A grid read from `<base>.json` (the header) and `<base>.bin` (float32 elevations). */
export type StoredHeightmapRead =
  | { readonly kind: 'found'; readonly result: TerrainResult }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid'; readonly reason: string };

function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

export async function readStoredHeightmap(
  store: CacheStore,
  baseKey: string,
): Promise<StoredHeightmapRead> {
  const [headerBlob, dataBlob] = await Promise.all([
    store.get(`${baseKey}.json`),
    store.get(`${baseKey}.bin`),
  ]);
  if (headerBlob === undefined || dataBlob === undefined) return { kind: 'missing' };
  const header = parseHeightmapHeader(parseJsonBytes(headerBlob.bytes));
  if (!header.ok) return { kind: 'invalid', reason: `${baseKey}.json is not a heightmap header` };
  const decoded = decodeHeightmap(header.value, dataBlob.bytes);
  return decoded.ok
    ? { kind: 'found', result: decoded.value }
    : { kind: 'invalid', reason: `${baseKey}.bin does not match its header` };
}

export async function writeStoredHeightmap(
  store: CacheStore,
  baseKey: string,
  stored: StoredHeightmap,
): Promise<void> {
  const headerBytes = new TextEncoder().encode(JSON.stringify(stored.header));
  await store.put(`${baseKey}.json`, headerBytes, HEADER_TYPE);
  await store.put(`${baseKey}.bin`, stored.bytes, DATA_TYPE);
}
