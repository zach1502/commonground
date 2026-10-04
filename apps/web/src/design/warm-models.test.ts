import { describe, expect, it, vi } from 'vitest';

import { modelUrlsFor, warmDesignModels, warmModels } from './warm-models';

const MANIFEST = {
  'tree-garry-oak': { url: '/models/tree-garry-oak.glb' },
  bench: { url: '/models/bench.glb' },
};

const DOCUMENT = {
  items: [
    { catalogId: 'garry-oak' },
    { catalogId: 'garry-oak' },
    { catalogId: 'bench' },
    { catalogId: 'no-such-item' },
  ],
};

describe('modelUrlsFor', () => {
  it('lists each model file the design draws once', () => {
    expect(modelUrlsFor(DOCUMENT, MANIFEST)).toEqual([
      '/models/tree-garry-oak.glb',
      '/models/bench.glb',
    ]);
  });

  it('lists nothing for a document it cannot read', () => {
    expect(modelUrlsFor({ items: 'broken' }, MANIFEST)).toEqual([]);
    expect(modelUrlsFor(null, MANIFEST)).toEqual([]);
  });
});

describe('warmModels', () => {
  it('starts every model download at once, so the 3D view finds them in the cache', () => {
    const urls: string[] = [];
    warmModels(DOCUMENT, MANIFEST, (url) => {
      urls.push(url);
      return Promise.resolve(undefined);
    });
    expect(urls).toEqual(['/models/tree-garry-oak.glb', '/models/bench.glb']);
  });

  it('ignores a failed download; the view asks again and draws placeholders', async () => {
    const fetchFile = vi.fn().mockRejectedValue(new TypeError('offline'));
    expect(() => {
      warmModels(DOCUMENT, MANIFEST, fetchFile);
    }).not.toThrow();
    await Promise.resolve();
  });
});

describe('warmDesignModels', () => {
  it('reads the models index, then fetches the models the design draws', async () => {
    const calls: string[] = [];
    const index = { models: [{ modelKey: 'bench', file: 'models/bench.glb' }] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      calls.push(url);
      return Promise.resolve(url.endsWith('index.json') ? Response.json(index) : new Response(''));
    });
    warmDesignModels(DOCUMENT);
    await vi.waitFor(() => {
      expect(calls).toEqual(['/models/index.json', '/models/bench.glb']);
    });
    fetchSpy.mockRestore();
  });
});
