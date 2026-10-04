/** A stored value: bytes plus the MIME type it was saved with. */
export interface CachedBlob {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/**
 * Where providers keep fetched grids between runs. It matches the get and put methods of the
 * storage package's BlobStore, so apps/api can pass a BlobStore here. Terrain cannot import
 * storage (see the dependency table in AGENTS.md), so the shape is repeated.
 */
export interface CacheStore {
  get(key: string): Promise<CachedBlob | undefined>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
}
