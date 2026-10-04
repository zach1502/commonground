import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';

import { modelsManifestSchema, sourceManifestSchema, type ModelEntry } from './manifest-schema.js';
import { countTriangles, measureBounds, nonUniformNodes } from './pipeline.js';
import { MODEL_INDEX_FILE } from './run.js';
import { assetTargets, BUDGETS } from './targets.js';

// These tests read the committed output of `build-assets`, so a stale build fails here.
const TOLERANCE = 0.02;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

const modelsManifest = modelsManifestSchema.parse(readJson('../generated/models.manifest.json'));
const sourceManifest = sourceManifestSchema.parse(readJson('../manifest.json'));
const targets = assetTargets();
const publicDir = new URL('../../../apps/web/public/', import.meta.url);

function entryFor(modelKey: string): ModelEntry {
  const entry = modelsManifest.models.find((model) => model.modelKey === modelKey);
  if (entry === undefined) throw new Error(`no manifest entry for ${modelKey}`);
  return entry;
}

function withinTolerance(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * TOLERANCE;
}

let io: NodeIO;

beforeAll(async () => {
  await MeshoptDecoder.ready;
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
});

describe('manifest.json', () => {
  it('lists a source for every catalog and kit model', () => {
    const listed = new Set(sourceManifest.models.map((model) => model.modelKey));
    expect(targets.filter((target) => !listed.has(target.modelKey))).toEqual([]);
  });
});

describe('models.manifest.json', () => {
  it('has exactly one entry per catalog and kit model', () => {
    expect(modelsManifest.models.map((model) => model.modelKey).sort()).toEqual(
      targets.map((target) => target.modelKey).sort(),
    );
  });

  it.each(targets)('$modelKey matches its catalog size on the fitted axis', (target) => {
    const entry = entryFor(target.modelKey);
    expect(entry.scalePolicy).toBe(target.scalePolicy);
    expect(withinTolerance(entry.dims[entry.fittedAxis], target.dims[entry.fittedAxis])).toBe(true);
  });

  // Preflight's catalog-integrity rule compares these footprints; a tree's plan is its trunk.
  it.each(targets.filter((target) => target.scalePolicy === 'fixed' && target.category !== 'tree'))(
    '$modelKey matches its catalog footprint on width and depth',
    (target) => {
      const { dims } = entryFor(target.modelKey);
      expect({
        widthM: withinTolerance(dims.widthM, target.dims.widthM),
        depthM: withinTolerance(dims.depthM, target.dims.depthM),
      }).toEqual({ widthM: true, depthM: true });
    },
  );

  it.each(targets)('$modelKey stays inside its triangle budget', (target) => {
    expect(entryFor(target.modelKey).triangles.after).toBeLessThanOrEqual(
      BUDGETS[target.budgetClass].triangles,
    );
  });

  it('is published to the browser as a model index with the same files', () => {
    const index = readJson(`../../../apps/web/public/models/${MODEL_INDEX_FILE}`);
    expect(index).toMatchObject({
      models: modelsManifest.models.map(({ modelKey, file }) => ({ modelKey, file })),
    });
  });

  it('keeps the processed models under 15 MB in total', () => {
    const total = modelsManifest.models.reduce(
      (sum, entry) => sum + statSync(fileURLToPath(new URL(entry.file, publicDir))).size,
      0,
    );
    expect(total).toBeLessThan(MAX_TOTAL_BYTES);
  });
});

describe('processed GLBs', () => {
  it.each(modelsManifest.models)(
    '$modelKey has uniform node scales and the listed size',
    async (entry) => {
      const document = await io.read(fileURLToPath(new URL(entry.file, publicDir)));
      expect(nonUniformNodes(document)).toEqual([]);
      expect(countTriangles(document)).toBe(entry.triangles.after);
      const { min, dims } = measureBounds(document);
      expect(Math.abs(min[1])).toBeLessThan(entry.dims.heightM * TOLERANCE + 1e-3);
      expect(withinTolerance(dims[entry.fittedAxis], entry.dims[entry.fittedAxis])).toBe(true);
    },
  );
});
