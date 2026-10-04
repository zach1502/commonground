import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildModel, placeholderCredit, type BuildTools } from './build.js';
import { CC0, PLACEHOLDER_SOURCE, type SourceModel } from './manifest-schema.js';
import { measureBounds, nonUniformNodes } from './pipeline.js';
import { documentFromParts } from './procedural.js';
import { assetTargets, type AssetTarget } from './targets.js';

let tools: BuildTools;

beforeAll(async () => {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  tools = {
    io,
    simplifier: MeshoptSimplifier,
    encoder: MeshoptEncoder,
    // A bench authored in centimetres along z, the way many source files arrive.
    loadSource: () =>
      Promise.resolve(
        documentFromParts('bench', [
          {
            shape: 'box',
            widthM: 50,
            depthM: 180,
            heightM: 90,
            x: 7,
            baseY: 3,
            z: 0,
            colour: 'wood',
          },
        ]),
      ),
  };
});

function targetFor(modelKey: string): AssetTarget {
  const target = assetTargets().find((entry) => entry.modelKey === modelKey);
  if (target === undefined) throw new Error(`no target ${modelKey}`);
  return target;
}

const kenneyBench: SourceModel = {
  modelKey: 'bench',
  category: 'seating',
  source: { name: 'Kenney', url: 'https://kenney.nl/kit.zip', author: 'Kenney', licence: CC0 },
  file: 'bench.glb',
  yawDeg: 90,
};

describe('buildModel', () => {
  it('turns, fits, grounds and compresses a source model', async () => {
    const result = await buildModel(targetFor('bench'), kenneyBench, tools);
    expect(result.placeholder).toBe(false);
    expect(result.entry.fittedAxis).toBe('widthM');
    expect(result.entry.dims.widthM).toBeCloseTo(1.8, 2);
    expect(result.entry.source).toEqual({
      name: 'Kenney',
      url: 'https://kenney.nl/kit.zip',
      author: 'Kenney',
    });
    const written = await tools.io.readBinary(result.glb);
    const bounds = measureBounds(written);
    expect(bounds.min[1]).toBeCloseTo(0, 2);
    expect(bounds.dims.widthM).toBeCloseTo(1.8, 2);
    expect(nonUniformNodes(written)).toEqual([]);
  });

  it('builds the procedural placeholder when the manifest says so', async () => {
    const model = { ...kenneyBench, source: { ...placeholderCredit(), licence: CC0 } };
    const result = await buildModel(targetFor('swings'), model, tools);
    expect(result.placeholder).toBe(true);
    expect(result.entry.source.name).toBe(PLACEHOLDER_SOURCE);
    expect(result.entry.triangles.after).toBeLessThanOrEqual(2000);
  });

  it('falls back to the placeholder and says why when the download fails', async () => {
    const failing: BuildTools = {
      ...tools,
      loadSource: () => Promise.reject(new Error('offline')),
    };
    const result = await buildModel(targetFor('bench'), kenneyBench, failing);
    expect(result).toMatchObject({ placeholder: true, reason: 'offline' });
    expect(result.entry.licence).toBe(CC0);
  });

  it('falls back to quantization when no encoder is available', async () => {
    const result = await buildModel(targetFor('lawn'), undefined, { ...tools, encoder: undefined });
    expect(result.compression).toBe('quantize');
    expect(result.entry.dims.widthM).toBeCloseTo(Math.sqrt(500), 1);
  });
});
