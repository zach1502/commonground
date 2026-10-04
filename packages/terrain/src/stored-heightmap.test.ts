import { describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { encodeHeightmap } from './heightmap-codec.js';
import { JONATHAN_ROGERS_POLYGON } from './ports/__contracts__/jonathan-rogers.js';
import type { CachedBlob, CacheStore } from './ports/cache-store.js';
import { readStoredHeightmap, writeStoredHeightmap } from './stored-heightmap.js';

const SOURCE = { name: 'NRCan HRDEM', licence: 'OGL-Canada', url: 'https://example.test' };

function memoryStore(): CacheStore & { readonly keys: () => string[] } {
  const blobs = new Map<string, CachedBlob>();
  return {
    get: (key) => Promise.resolve(blobs.get(key)),
    put: (key, bytes, contentType) => {
      blobs.set(key, { bytes, contentType });
      return Promise.resolve();
    },
    keys: () => [...blobs.keys()].sort(),
  };
}

function sample() {
  const heightmap = makeRampHeightmap({ width: 3, height: 2, gradeX: 0.5, baseM: 30 });
  return encodeHeightmap({
    result: { heightmap, source: SOURCE, crs: 'EPSG:3979' },
    polygonWgs84: JONATHAN_ROGERS_POLYGON,
    frameOrigin: { lat: 49.26, lon: -123.1 },
  });
}

describe('stored heightmaps', () => {
  it('writes a header and data pair and reads the grid back', async () => {
    const store = memoryStore();
    await writeStoredHeightmap(store, 'terrain/park', sample());
    expect(store.keys()).toEqual(['terrain/park.bin', 'terrain/park.json']);
    const read = await readStoredHeightmap(store, 'terrain/park');
    expect(read.kind).toBe('found');
    if (read.kind === 'found') expect(read.result.heightmap.width).toBe(3);
  });

  it('reports a missing pair as missing', async () => {
    expect(await readStoredHeightmap(memoryStore(), 'terrain/none')).toEqual({ kind: 'missing' });
  });

  it('reports a header that does not parse or bytes of the wrong size as invalid', async () => {
    const store = memoryStore();
    const stored = sample();
    await writeStoredHeightmap(store, 'terrain/short', { ...stored, bytes: new Uint8Array(4) });
    await store.put('terrain/text.json', new TextEncoder().encode('{'), 'application/json');
    await store.put('terrain/text.bin', stored.bytes, 'application/octet-stream');
    expect((await readStoredHeightmap(store, 'terrain/short')).kind).toBe('invalid');
    expect((await readStoredHeightmap(store, 'terrain/text')).kind).toBe('invalid');
  });
});
