import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';
import { InMemoryBlobStore, SupabaseStorageBlobStore } from '@parkshape/storage';
import type { HttpFetch } from '@parkshape/terrain';

import { createInMemoryDeps } from '../src/container.js';
import { OfflineRequestError, offlineFetch } from '../src/offline-fetch.js';

import { JONATHAN_ROGERS_OUTLINE } from './fixtures.js';
import { START, STAFF, startHarness, type Harness } from './harness.js';

const SUPABASE = {
  BLOB_STORE: 'supabase',
  SUPABASE_URL: 'https://example-ref.supabase.co',
  SUPABASE_SERVICE_KEY: 'test-service-key',
};
function depsFor(env: Record<string, string>, fetch?: HttpFetch) {
  return createInMemoryDeps(loadConfig(env), {
    clock: new FakeClock(START),
    authSecret: 'blob-store-test-secret-of-32-characters',
    ...(fetch === undefined ? {} : { fetch }),
  });
}

describe('blob store selection', () => {
  it('keeps blobs in memory by default', () => {
    expect(depsFor({}).blobStore).toBeInstanceOf(InMemoryBlobStore);
  });

  it('uses Supabase Storage when BLOB_STORE is supabase, with URLs through the API', () => {
    const { blobStore } = depsFor({ ...SUPABASE, VITE_API_URL: 'https://api.example.ca' });
    expect(blobStore).toBeInstanceOf(SupabaseStorageBlobStore);
    expect(blobStore.url('renders/d1.png')).toBe('https://api.example.ca/blobs/renders/d1.png');
  });

  it('sends Supabase uploads through the injected fetch to the configured bucket', async () => {
    const urls: string[] = [];
    const fetch: HttpFetch = (url) => {
      urls.push(url);
      return Promise.resolve(new Response('{}'));
    };
    const deps = depsFor({ ...SUPABASE, SUPABASE_BUCKET: 'renders' }, fetch);
    await deps.blobStore.put('a/b.png', new Uint8Array([1]), 'image/png');
    expect(urls).toEqual(['https://example-ref.supabase.co/storage/v1/object/renders/a/b.png']);
  });
});

describe('offline mode', () => {
  it('rejects every request with a typed error', async () => {
    await expect(offlineFetch('https://example.ca/x')).rejects.toBeInstanceOf(OfflineRequestError);
    await expect(offlineFetch('https://example.ca/x')).rejects.toMatchObject({
      kind: 'offline',
      url: 'https://example.ca/x',
    });
  });

  it('blocks the network adapters even when a fetch is injected', async () => {
    const deps = depsFor({ ...SUPABASE, PARKSHAPE_OFFLINE: '1' }, (url) => fetch(url));
    await expect(deps.blobStore.get('a.png')).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('the local stack with PARKSHAPE_OFFLINE=1', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ PARKSHAPE_OFFLINE: '1' });
  });

  afterAll(async () => {
    await h.close();
  });

  it('serves health, personas, login and projects', async () => {
    expect((await h.call('GET', '/health')).status).toBe(200);
    expect((await h.call('GET', '/auth/personas')).status).toBe(200);
    const staff = await h.login(STAFF);
    expect((await h.call('GET', '/me', { cookie: staff })).status).toBe(200);
    expect((await h.call('GET', '/projects')).status).toBe(200);
  });

  it('builds the site terrain from the static providers', async () => {
    const staff = await h.login(STAFF);
    const body = { polygonWgs84: JONATHAN_ROGERS_OUTLINE, resolutionM: 2 };
    const response = await h.call('POST', '/terrain', { cookie: staff, body });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ provider: 'static' });
  });
});
