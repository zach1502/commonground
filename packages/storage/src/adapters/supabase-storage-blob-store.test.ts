import { describe, expect, it } from 'vitest';

import { blobStoreContract } from '../ports/__contracts__/blob-store.contract.js';

import {
  SupabaseStorageBlobStore,
  type StorageFetch,
  type SupabaseStorageBlobStoreOptions,
} from './supabase-storage-blob-store.js';

const PROJECT_URL = 'https://example-ref.supabase.co';
const SERVICE_KEY = 'test-service-key';
const BUCKET = 'parkshape';
const PUBLIC_BASE_URL = 'http://localhost:8787/blobs';
const OBJECT_PREFIX = `/storage/v1/object/${BUCKET}/`;

interface FakeObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

function jsonResponse(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isAuthorised(headers: Headers): boolean {
  return (
    headers.get('authorization') === `Bearer ${SERVICE_KEY}` &&
    headers.get('apikey') === SERVICE_KEY
  );
}

async function upload(objects: Map<string, FakeObject>, name: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (objects.has(name) && headers.get('x-upsert') !== 'true') {
    return jsonResponse(400, { statusCode: '409', error: 'Duplicate', message: 'exists' });
  }
  const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
  objects.set(name, { bytes, contentType: headers.get('content-type') ?? '' });
  return jsonResponse(200, { Key: `${BUCKET}/${name}` });
}

function download(objects: Map<string, FakeObject>, name: string): Response {
  const object = objects.get(name);
  if (object === undefined) {
    // Supabase Storage answers a missing object with HTTP 400 and a 404 in the body.
    return jsonResponse(400, {
      statusCode: '404',
      error: 'not_found',
      message: 'Object not found',
    });
  }
  return new Response(object.bytes.slice(), { headers: { 'content-type': object.contentType } });
}

/** An in-memory stand-in for the Storage REST endpoints the adapter calls. */
function fakeStorageApi(): StorageFetch {
  const objects = new Map<string, FakeObject>();
  return async (url, init = {}) => {
    const { origin, pathname } = new URL(url);
    if (origin !== PROJECT_URL || !pathname.startsWith(OBJECT_PREFIX)) {
      return jsonResponse(400, { statusCode: '404', error: 'Bucket not found', message: pathname });
    }
    if (!isAuthorised(new Headers(init.headers))) {
      return jsonResponse(400, { statusCode: '403', error: 'Unauthorized', message: 'bad key' });
    }
    const name = decodeURIComponent(pathname.slice(OBJECT_PREFIX.length));
    return init.method === 'POST' ? upload(objects, name, init) : download(objects, name);
  };
}

function makeStore(overrides: Partial<SupabaseStorageBlobStoreOptions> = {}) {
  return new SupabaseStorageBlobStore({
    projectUrl: PROJECT_URL,
    serviceKey: SERVICE_KEY,
    bucket: BUCKET,
    publicBaseUrl: PUBLIC_BASE_URL,
    fetch: fakeStorageApi(),
    ...overrides,
  });
}

blobStoreContract('SupabaseStorageBlobStore', () => Promise.resolve(makeStore()));

describe('SupabaseStorageBlobStore', () => {
  it('serves blob URLs through the API so the bucket can stay private', () => {
    expect(makeStore().url('renders/d1/top.png')).toBe(`${PUBLIC_BASE_URL}/renders/d1/top.png`);
  });

  it('trims a trailing slash from the project URL', async () => {
    const store = makeStore({ projectUrl: `${PROJECT_URL}/` });
    await store.put('a.txt', new Uint8Array([1]), 'text/plain');
    expect((await store.get('a.txt'))?.contentType).toBe('text/plain');
  });

  it('treats an HTTP 404 as a missing blob', async () => {
    const store = makeStore({ fetch: () => Promise.resolve(new Response('', { status: 404 })) });
    expect(await store.get('gone.png')).toBeUndefined();
  });

  it('throws a typed error when the service key is wrong', async () => {
    const store = makeStore({ serviceKey: 'wrong' });
    await expect(store.put('a.txt', new Uint8Array([1]), 'text/plain')).rejects.toMatchObject({
      kind: 'blob-store-request',
      operation: 'put',
      status: 400,
    });
    await expect(store.get('a.txt')).rejects.toMatchObject({ operation: 'get', key: 'a.txt' });
  });

  it('throws a typed error on a server failure', async () => {
    const store = makeStore({
      fetch: () => Promise.resolve(new Response('down', { status: 503 })),
    });
    await expect(store.get('a.txt')).rejects.toMatchObject({ status: 503 });
  });

  it('falls back to a binary content type when the response has none', async () => {
    const bytes = new Uint8Array([4]);
    const response = new Response(bytes);
    response.headers.delete('content-type');
    const store = makeStore({ fetch: () => Promise.resolve(response) });
    expect((await store.get('raw.bin'))?.contentType).toBe('application/octet-stream');
  });
});
