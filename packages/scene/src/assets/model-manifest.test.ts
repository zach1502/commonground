import { describe, expect, it } from 'vitest';

import { assetManifestFromModels } from './model-manifest.js';

const manifest = {
  note: 'Written by the asset pipeline.',
  models: [
    { modelKey: 'bench', file: 'models/bench.glb', dims: { widthM: 1.8 } },
    { modelKey: 'tree-douglas-fir', file: 'models/tree-douglas-fir.glb' },
  ],
};

describe('assetManifestFromModels', () => {
  it('maps each model key to its file under the base URL', () => {
    expect(assetManifestFromModels(manifest, '/')).toEqual({
      bench: { url: '/models/bench.glb' },
      'tree-douglas-fir': { url: '/models/tree-douglas-fir.glb' },
    });
  });

  it('adds the slash between a base URL and the file', () => {
    expect(assetManifestFromModels(manifest, 'https://cdn.example/app').bench).toEqual({
      url: 'https://cdn.example/app/models/bench.glb',
    });
  });

  it('skips entries without a model key or file', () => {
    const partial = { models: [{ modelKey: 'bench' }, { file: 'models/x.glb' }, 'lawn', null] };
    expect(assetManifestFromModels(partial, '/')).toEqual({});
  });

  it('returns an empty manifest when there is no model list', () => {
    expect(assetManifestFromModels(undefined, '/')).toEqual({});
    expect(assetManifestFromModels({ models: 'none' }, '/')).toEqual({});
  });
});
