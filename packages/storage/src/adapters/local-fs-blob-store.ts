import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { assertBlobKey, blobUrl, type BlobStore, type StoredBlob } from '../ports/blob-store.js';

export interface LocalFsBlobStoreOptions {
  readonly rootDir: string;
  readonly baseUrl: string;
}

// The content type sits next to the blob so a restart can serve it back unchanged.
const META_SUFFIX = '.meta.json';

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Writes blobs under a directory on disk; survives restarts of the local API. */
export class LocalFsBlobStore implements BlobStore {
  constructor(private readonly options: LocalFsBlobStoreOptions) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await writeFile(`${path}${META_SUFFIX}`, JSON.stringify({ contentType }));
  }

  async get(key: string): Promise<StoredBlob | undefined> {
    const path = this.pathOf(key);
    try {
      const [bytes, meta] = await Promise.all([
        readFile(path),
        readFile(`${path}${META_SUFFIX}`, 'utf8'),
      ]);
      const { contentType } = JSON.parse(meta) as { contentType: string };
      return { bytes: new Uint8Array(bytes), contentType };
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      throw error;
    }
  }

  url(key: string): string {
    return blobUrl(this.options.baseUrl, key);
  }

  private pathOf(key: string): string {
    return join(this.options.rootDir, assertBlobKey(key));
  }
}
