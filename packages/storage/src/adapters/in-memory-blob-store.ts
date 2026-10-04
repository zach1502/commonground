import { assertBlobKey, blobUrl, type BlobStore, type StoredBlob } from '../ports/blob-store.js';

export interface InMemoryBlobStoreOptions {
  readonly baseUrl: string;
}

/** Keeps blobs in a Map; the default store for local runs and tests. */
export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, StoredBlob>();

  constructor(private readonly options: InMemoryBlobStoreOptions) {}

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    return Promise.resolve().then(() => {
      this.blobs.set(assertBlobKey(key), { bytes: bytes.slice(), contentType });
    });
  }

  get(key: string): Promise<StoredBlob | undefined> {
    return Promise.resolve().then(() => {
      const blob = this.blobs.get(assertBlobKey(key));
      return blob === undefined ? undefined : { ...blob, bytes: blob.bytes.slice() };
    });
  }

  url(key: string): string {
    return blobUrl(this.options.baseUrl, key);
  }
}
