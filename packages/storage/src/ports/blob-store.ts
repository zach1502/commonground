/** A stored file: its bytes and the MIME type it was saved with. */
export interface StoredBlob {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Keeps uploaded files and renders under slash-separated keys such as `renders/d1/top.png`. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredBlob | undefined>;
  url(key: string): string;
}

/** Thrown when a key is empty, absolute or climbs out of the store with `..`. */
export class InvalidBlobKeyError extends Error {
  readonly kind = 'invalid-blob-key';

  constructor(readonly key: string) {
    super(`Invalid blob key "${key}"`);
    this.name = 'InvalidBlobKeyError';
  }
}

export type BlobStoreOperation = 'put' | 'get';

/** Thrown when a remote store answers with a status the adapter does not handle. */
export class BlobStoreRequestError extends Error {
  readonly kind = 'blob-store-request';

  constructor(
    readonly operation: BlobStoreOperation,
    readonly key: string,
    readonly status: number,
  ) {
    super(`Blob store ${operation} of "${key}" failed with HTTP ${String(status)}`);
    this.name = 'BlobStoreRequestError';
  }
}

const KEY_PATTERN = /^[\w-][\w./-]*$/;

/** Returns the key unchanged when it is safe to use as a relative path. */
export function assertBlobKey(key: string): string {
  const segments = key.split('/');
  if (!KEY_PATTERN.test(key) || segments.some((segment) => segment === '..' || segment === '')) {
    throw new InvalidBlobKeyError(key);
  }
  return key;
}

/** Joins a base URL and a checked key with exactly one slash between them. */
export function blobUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${assertBlobKey(key)}`;
}
