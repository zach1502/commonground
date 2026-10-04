/** Builds a blob key from path segments, trimming stray slashes. */
export function blobKey(...segments: readonly string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment !== '')
    .join('/');
}

export { BlobStoreRequestError, InvalidBlobKeyError, assertBlobKey } from './ports/blob-store.js';
export type { BlobStore, BlobStoreOperation, StoredBlob } from './ports/blob-store.js';
export { InMemoryBlobStore } from './adapters/in-memory-blob-store.js';
export type { InMemoryBlobStoreOptions } from './adapters/in-memory-blob-store.js';
export { LocalFsBlobStore } from './adapters/local-fs-blob-store.js';
export type { LocalFsBlobStoreOptions } from './adapters/local-fs-blob-store.js';
export { SupabaseStorageBlobStore } from './adapters/supabase-storage-blob-store.js';
export type {
  StorageFetch,
  SupabaseStorageBlobStoreOptions,
} from './adapters/supabase-storage-blob-store.js';
