import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { blobStoreContract } from '../ports/__contracts__/blob-store.contract.js';

import { InMemoryBlobStore } from './in-memory-blob-store.js';
import { LocalFsBlobStore } from './local-fs-blob-store.js';

const BASE_URL = 'http://localhost:8787/blobs';
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-blobs-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

blobStoreContract('InMemoryBlobStore', () =>
  Promise.resolve(new InMemoryBlobStore({ baseUrl: BASE_URL })),
);
blobStoreContract(
  'LocalFsBlobStore',
  async () => new LocalFsBlobStore({ rootDir: await makeTempDir(), baseUrl: BASE_URL }),
);

describe('LocalFsBlobStore', () => {
  it('keeps blobs across instances that share a directory', async () => {
    const rootDir = await makeTempDir();
    await new LocalFsBlobStore({ rootDir, baseUrl: BASE_URL }).put(
      'a/b.txt',
      new Uint8Array([7]),
      'text/plain',
    );
    const blob = await new LocalFsBlobStore({ rootDir, baseUrl: BASE_URL }).get('a/b.txt');
    expect(blob?.contentType).toBe('text/plain');
  });

  it('trims a trailing slash from the base URL', () => {
    const store = new LocalFsBlobStore({ rootDir: '/tmp/unused', baseUrl: `${BASE_URL}/` });
    expect(store.url('x.png')).toBe(`${BASE_URL}/x.png`);
  });
});
