import { describe, expect, it } from 'vitest';

import { modelsManifestSchema, sourceManifestSchema } from './manifest-schema.js';

const kenney = { name: 'Kenney', url: 'https://kenney.nl/nature.zip', author: 'Kenney' };

const entry = {
  modelKey: 'bench',
  file: 'models/bench.glb',
  dims: { widthM: 1.8, depthM: 0.5, heightM: 0.8 },
  fittedAxis: 'widthM',
  triangles: { before: 400, after: 380 },
  bytes: 4000,
  scalePolicy: 'fixed',
  licence: 'CC0-1.0',
  source: kenney,
};

describe('sourceManifestSchema', () => {
  it('accepts CC0 sources and models that name one of them', () => {
    const manifest = {
      sources: [{ ...kenney, url: 'https://kenney.nl', licence: 'CC0-1.0' }],
      models: [
        {
          modelKey: 'bench',
          category: 'seating',
          source: { ...kenney, licence: 'CC0-1.0' },
          file: 'Models/bench.glb',
        },
      ],
    };
    expect(sourceManifestSchema.parse(manifest).models[0]?.yawDeg).toBe(0);
  });

  it('keeps a quarter turn for a model authored along the other axis', () => {
    const manifest = {
      sources: [{ ...kenney, url: 'https://kenney.nl', licence: 'CC0-1.0' }],
      models: [
        {
          modelKey: 'hedge',
          category: 'shrub',
          source: { ...kenney, licence: 'CC0-1.0' },
          file: 'Models/GLB format/hedge-large.glb',
          yawDeg: 90,
        },
      ],
    };
    expect(sourceManifestSchema.parse(manifest).models[0]?.yawDeg).toBe(90);
  });

  it('rejects a licence other than CC0', () => {
    const manifest = {
      sources: [{ ...kenney, licence: 'CC-BY-3.0' }],
      models: [],
    };
    expect(sourceManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a model whose source is not in the source list', () => {
    const manifest = {
      sources: [{ ...kenney, licence: 'CC0-1.0' }],
      models: [
        {
          modelKey: 'bench',
          category: 'seating',
          source: { ...kenney, name: 'Elsewhere', licence: 'CC0-1.0' },
          file: 'bench.glb',
        },
      ],
    };
    expect(sourceManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe('modelsManifestSchema', () => {
  it('accepts a processed model entry', () => {
    expect(modelsManifestSchema.parse({ note: 'x', models: [entry] }).models).toHaveLength(1);
  });

  it('rejects a file path outside models/', () => {
    const result = modelsManifestSchema.safeParse({
      note: 'x',
      models: [{ ...entry, file: 'bench.glb' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more triangles after processing than before', () => {
    const result = modelsManifestSchema.safeParse({
      note: 'x',
      models: [{ ...entry, triangles: { before: 10, after: 11 } }],
    });
    expect(result.success).toBe(false);
  });
});
