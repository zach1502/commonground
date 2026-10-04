import { describe, expect, it } from 'vitest';

import type { BlobStore } from '../blob-store.js';

const PNG_TYPE = 'image/png';
const JSON_TYPE = 'application/json';

/** Behaviour every BlobStore adapter must have. Each adapter test calls this with a factory. */
export function blobStoreContract(name: string, makeStore: () => Promise<BlobStore>): void {
  describe(`${name} meets the BlobStore contract`, () => {
    it('returns the bytes and content type that were put', async () => {
      const store = await makeStore();
      await store.put('renders/site-1/top.png', new Uint8Array([1, 2, 3]), PNG_TYPE);
      const blob = await store.get('renders/site-1/top.png');
      expect(blob?.contentType).toBe(PNG_TYPE);
      expect([...(blob?.bytes ?? [])]).toEqual([1, 2, 3]);
    });

    it('returns undefined for a key that was never put', async () => {
      const store = await makeStore();
      expect(await store.get('renders/missing.png')).toBeUndefined();
    });

    it('replaces the blob when the same key is put twice', async () => {
      const store = await makeStore();
      await store.put('designs/d1.json', new Uint8Array([1]), JSON_TYPE);
      await store.put('designs/d1.json', new Uint8Array([9, 9]), PNG_TYPE);
      const blob = await store.get('designs/d1.json');
      expect([...(blob?.bytes ?? [])]).toEqual([9, 9]);
      expect(blob?.contentType).toBe(PNG_TYPE);
    });

    it('keeps its own copy so later changes to the input do not leak in', async () => {
      const store = await makeStore();
      const bytes = new Uint8Array([5]);
      await store.put('copy/check.bin', bytes, JSON_TYPE);
      bytes[0] = 0;
      const blob = await store.get('copy/check.bin');
      expect(blob?.bytes[0]).toBe(5);
    });

    it('builds a URL that ends with the key', async () => {
      const store = await makeStore();
      expect(store.url('renders/site-1/top.png').endsWith('/renders/site-1/top.png')).toBe(true);
    });

    it('rejects keys that climb out of the store or are empty', async () => {
      const store = await makeStore();
      const bytes = new Uint8Array([1]);
      await expect(store.put('../escape.png', bytes, PNG_TYPE)).rejects.toMatchObject({
        kind: 'invalid-blob-key',
      });
      await expect(store.get('')).rejects.toMatchObject({ kind: 'invalid-blob-key' });
      expect(() => store.url('/abs/path')).toThrow(/blob key/);
    });
  });
}
