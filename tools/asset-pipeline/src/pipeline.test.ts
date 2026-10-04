import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { normals, unweld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';

import {
  bakeNodeTransforms,
  centerOnGround,
  compressModel,
  countTriangles,
  measureBounds,
  nonUniformNodes,
  rescaleToTarget,
  simplifyToBudget,
  weldModel,
  writeManifestEntry,
} from './pipeline.js';
import { documentFromParts, placeholderDocument, type Part } from './procedural.js';
import { assetTargets } from './targets.js';

function box(size: Partial<Part>): Part {
  return {
    shape: 'box',
    widthM: 1,
    depthM: 1,
    heightM: 1,
    x: 0,
    baseY: 0,
    z: 0,
    colour: 'wood',
    ...size,
  };
}

function boxDocument(size: Partial<Part>): Document {
  return documentFromParts('box', [box(size)]);
}

describe('measureBounds', () => {
  it('reports the size of the scene in metres', () => {
    const bounds = measureBounds(boxDocument({ widthM: 2, depthM: 3, heightM: 4, baseY: 1 }));
    expect(bounds.dims).toEqual({ widthM: 2, depthM: 3, heightM: 4 });
    expect(bounds.min[1]).toBe(1);
  });
});

describe('bakeNodeTransforms', () => {
  it('moves node transforms into the vertices and turns the model about y', async () => {
    const document = boxDocument({ widthM: 4, depthM: 1, heightM: 1, x: 5 });
    await bakeNodeTransforms(document, 90);
    const nodes = document.getRoot().listNodes();
    nodes.forEach((node) => {
      expect(node.getTranslation()).toEqual([0, 0, 0]);
    });
    const { dims } = measureBounds(document);
    expect(dims.widthM).toBeCloseTo(1);
    expect(dims.depthM).toBeCloseTo(4);
  });
});

describe('rescaleToTarget', () => {
  it('fits the largest catalog dimension for fixed items', () => {
    const document = boxDocument({ widthM: 1, depthM: 1, heightM: 2 });
    const fit = rescaleToTarget(document, { widthM: 0.6, depthM: 0.6, heightM: 20 }, 'fixed');
    expect(fit).toEqual({ factor: 10, fittedAxis: 'heightM' });
    expect(measureBounds(document).dims).toEqual({ widthM: 10, depthM: 10, heightM: 20 });
  });

  it('fits the limiting ground axis for tiles with one uniform factor', () => {
    const document = boxDocument({ widthM: 2, depthM: 1, heightM: 0.1 });
    const fit = rescaleToTarget(document, { widthM: 10, depthM: 10, heightM: 1 }, 'tile');
    expect(fit).toEqual({ factor: 5, fittedAxis: 'widthM' });
    const { dims } = measureBounds(document);
    expect(dims.depthM).toBeCloseTo(5);
    expect(dims.heightM).toBeCloseTo(0.5);
  });

  it('fits depth when depth limits a segment', () => {
    const document = boxDocument({ widthM: 1, depthM: 3, heightM: 0.1 });
    const fit = rescaleToTarget(document, { widthM: 3, depthM: 3, heightM: 1 }, 'segment');
    expect(fit.fittedAxis).toBe('depthM');
    expect(nonUniformNodes(document)).toEqual([]);
  });
});

describe('centerOnGround', () => {
  it('puts the lowest point on y = 0 and centres x and z', () => {
    const document = boxDocument({ x: 3, baseY: -2, z: -1, widthM: 2 });
    centerOnGround(document);
    const { min, max } = measureBounds(document);
    expect(min).toEqual([-1, 0, -0.5]);
    expect(max).toEqual([1, 1, 0.5]);
  });
});

describe('weldModel and simplifyToBudget', () => {
  it('welds shared corners and stays inside the triangle budget', async () => {
    const target = assetTargets().find((entry) => entry.modelKey === 'tree-garry-oak');
    if (target === undefined) throw new Error('no tree target');
    const document = placeholderDocument(target);
    const before = countTriangles(document);
    await weldModel(document);
    await MeshoptSimplifier.ready;
    const after = await simplifyToBudget(document, {
      budget: before / 2,
      error: 0.01,
      simplifier: MeshoptSimplifier,
    });
    expect(after).toBeLessThanOrEqual(before / 2);
    expect(after).toBe(countTriangles(document));
  });

  it('drops split normals to reach the budget on a flat shaded model', async () => {
    const document = documentFromParts('ball', [box({ shape: 'sphere' })]);
    await document.transform(unweld(), normals({ overwrite: true }));
    await weldModel(document);
    const before = countTriangles(document);
    const after = await simplifyToBudget(document, {
      budget: before / 3,
      error: 0.01,
      simplifier: MeshoptSimplifier,
    });
    expect(after).toBeLessThanOrEqual(before / 3);
    const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
    expect(primitive?.getAttribute('NORMAL')).toBeNull();
  });

  it('leaves a model that is already inside the budget alone', async () => {
    const document = boxDocument({});
    const after = await simplifyToBudget(document, {
      budget: 100,
      error: 0.01,
      simplifier: MeshoptSimplifier,
    });
    expect(after).toBe(12);
  });
});

describe('compressModel', () => {
  it('writes EXT_meshopt_compression when the encoder is ready', async () => {
    const document = boxDocument({ widthM: 2 });
    await MeshoptEncoder.ready;
    expect(await compressModel(document, MeshoptEncoder)).toBe('meshopt');
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
    const bytes = await io.writeBinary(document);
    const reread = await io.readBinary(bytes);
    const used = reread
      .getRoot()
      .listExtensionsUsed()
      .map((extension) => extension.extensionName);
    expect(used).toContain('EXT_meshopt_compression');
    expect(measureBounds(reread).dims.widthM).toBeCloseTo(2, 2);
    expect(nonUniformNodes(reread)).toEqual([]);
  });

  it('falls back to quantization without an encoder', async () => {
    const document = boxDocument({});
    expect(await compressModel(document, undefined)).toBe('quantize');
    const used = document
      .getRoot()
      .listExtensionsUsed()
      .map((extension) => extension.extensionName);
    expect(used).toContain('KHR_mesh_quantization');
  });
});

describe('nonUniformNodes', () => {
  it('names nodes whose scale differs between axes', () => {
    const document = boxDocument({});
    document.getRoot().listNodes()[0]?.setName('stretched').setScale([1, 2, 1]);
    expect(nonUniformNodes(document)).toEqual(['stretched']);
  });
});

describe('writeManifestEntry', () => {
  const entry = {
    modelKey: 'bench',
    file: 'models/bench.glb',
    dims: { widthM: 1.8, depthM: 0.5, heightM: 0.8 },
    fittedAxis: 'widthM' as const,
    triangles: { before: 10, after: 10 },
    bytes: 100,
    scalePolicy: 'fixed' as const,
    licence: 'CC0-1.0' as const,
    source: { name: 'Kenney', url: 'https://kenney.nl', author: 'Kenney' },
  };

  it('replaces the entry with the same key and keeps the list sorted', () => {
    const lawn = { ...entry, modelKey: 'lawn', file: 'models/lawn.glb' };
    const updated = writeManifestEntry([lawn, entry], { ...entry, bytes: 200 });
    expect(updated.map((item) => [item.modelKey, item.bytes])).toEqual([
      ['bench', 200],
      ['lawn', 100],
    ]);
  });
});
