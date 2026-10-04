import {
  assertBlobKey,
  BlobStoreRequestError,
  blobUrl,
  type BlobStore,
  type StoredBlob,
} from '../ports/blob-store.js';

/** The subset of fetch this adapter calls; tests inject a fake of the Storage REST API. */
export type StorageFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface SupabaseStorageBlobStoreOptions {
  /** The project URL, such as https://<ref>.supabase.co. */
  readonly projectUrl: string;
  /** The service role key. It stays on the server and is sent on every request. */
  readonly serviceKey: string;
  readonly bucket: string;
  /** Where browsers fetch blobs: the API's /blobs route, so the bucket can stay private. */
  readonly publicBaseUrl: string;
  readonly fetch: StorageFetch;
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const FALLBACK_CONTENT_TYPE = 'application/octet-stream';
const STORAGE_OBJECT_PATH = 'storage/v1/object';

/** Supabase Storage reports a missing object as HTTP 400 with `"statusCode": "404"` in the body. */
async function isMissingObject(response: Response): Promise<boolean> {
  if (response.status === HTTP_NOT_FOUND) {
    return true;
  }
  if (response.status !== HTTP_BAD_REQUEST) {
    return false;
  }
  const body: unknown = await response.json().catch(() => undefined);
  return (
    typeof body === 'object' &&
    body !== null &&
    'statusCode' in body &&
    body.statusCode === String(HTTP_NOT_FOUND)
  );
}

/** Keeps blobs in a Supabase Storage bucket through its REST API, with no SDK. */
export class SupabaseStorageBlobStore implements BlobStore {
  constructor(private readonly options: SupabaseStorageBlobStoreOptions) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.options.fetch(this.objectUrl(key), {
      method: 'POST',
      headers: { ...this.authHeaders(), 'content-type': contentType, 'x-upsert': 'true' },
      body: bytes.slice(),
    });
    if (!response.ok) {
      throw new BlobStoreRequestError('put', key, response.status);
    }
  }

  async get(key: string): Promise<StoredBlob | undefined> {
    const response = await this.options.fetch(this.objectUrl(key), {
      method: 'GET',
      headers: this.authHeaders(),
    });
    if (response.ok) {
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? FALLBACK_CONTENT_TYPE,
      };
    }
    if (await isMissingObject(response)) {
      return undefined;
    }
    throw new BlobStoreRequestError('get', key, response.status);
  }

  url(key: string): string {
    return blobUrl(this.options.publicBaseUrl, key);
  }

  private objectUrl(key: string): string {
    const path = assertBlobKey(key).split('/').map(encodeURIComponent).join('/');
    const base = this.options.projectUrl.replace(/\/+$/, '');
    return `${base}/${STORAGE_OBJECT_PATH}/${encodeURIComponent(this.options.bucket)}/${path}`;
  }

  private authHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.serviceKey}`,
      apikey: this.options.serviceKey,
    };
  }
}
