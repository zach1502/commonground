import { InMemoryBlobStore, type BlobStore, type StoredBlob } from '@parkshape/storage';

export type FaultMode = 'working' | 'failing';

/**
 * An in-memory blob store whose puts, gets, or both fail on demand, as a Supabase outage would.
 * Heightmaps written while it works stay readable, so a test can break only thumbnails.
 */
export class FaultyBlobStore implements BlobStore {
  putMode: FaultMode = 'working';
  getMode: FaultMode = 'working';
  private readonly inner = new InMemoryBlobStore({ baseUrl: 'http://localhost:8787/blobs' });

  put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.putMode === 'failing') return Promise.reject(new Error(`storage refused put ${key}`));
    return this.inner.put(key, bytes, contentType);
  }

  get(key: string): Promise<StoredBlob | undefined> {
    if (this.getMode === 'failing') return Promise.reject(new Error(`storage refused get ${key}`));
    return this.inner.get(key);
  }

  url(key: string): string {
    return this.inner.url(key);
  }
}
