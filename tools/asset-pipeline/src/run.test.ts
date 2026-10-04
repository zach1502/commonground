import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BuildTools } from './build.js';
import { CC0, modelsManifestSchema } from './manifest-schema.js';
import { documentFromParts } from './procedural.js';
import { parseArgs, runPipeline, type RunPaths } from './run.js';

let root = '';
let paths: RunPaths;
let tools: BuildTools;

const kenney = { name: 'Kenney', url: 'https://kenney.nl/kit.zip', author: 'Kenney', licence: CC0 };

beforeAll(async () => {
  await MeshoptSimplifier.ready;
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'asset-run-'));
  paths = {
    sourceManifest: join(root, 'manifest.json'),
    modelsManifest: join(root, 'models.manifest.json'),
    outputDir: join(root, 'public', 'models'),
  };
  writeFileSync(
    paths.sourceManifest,
    JSON.stringify({
      sources: [kenney],
      models: [{ modelKey: 'bench', category: 'seating', source: kenney, file: 'bench.glb' }],
    }),
  );
  tools = {
    io: new NodeIO(),
    simplifier: MeshoptSimplifier,
    encoder: undefined,
    loadSource: () =>
      Promise.resolve(
        documentFromParts('bench', [
          { shape: 'box', widthM: 2, depthM: 1, heightM: 1, x: 0, baseY: 0, z: 0, colour: 'wood' },
        ]),
      ),
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function readManifest() {
  return modelsManifestSchema.parse(JSON.parse(readFileSync(paths.modelsManifest, 'utf8')));
}

describe('parseArgs', () => {
  it('reads --only and --placeholders-only', () => {
    expect(parseArgs(['--only', 'bench', '--only', 'lawn', '--placeholders-only'])).toEqual({
      only: ['bench', 'lawn'],
      placeholdersOnly: true,
    });
    expect(parseArgs([])).toEqual({ only: [], placeholdersOnly: false });
  });

  it('rejects an unknown flag or a missing key', () => {
    expect(() => parseArgs(['--fast'])).toThrow(/--fast/);
    expect(() => parseArgs(['--only'])).toThrow(/--only/);
  });
});

describe('runPipeline', () => {
  it('writes one GLB and one manifest entry for a single model', async () => {
    const report = await runPipeline(paths, { only: ['bench'], placeholdersOnly: false }, tools);
    expect(report.map((row) => row.entry.modelKey)).toEqual(['bench']);
    expect(existsSync(join(paths.outputDir, 'bench.glb'))).toBe(true);
    const manifest = readManifest();
    expect(manifest.models[0]?.source.name).toBe('Kenney');
  });

  it('publishes a model index next to the GLBs for the browser', async () => {
    await runPipeline(paths, { only: ['bench'], placeholdersOnly: false }, tools);
    await runPipeline(paths, { only: ['lawn'], placeholdersOnly: false }, tools);
    const index: unknown = JSON.parse(readFileSync(join(paths.outputDir, 'index.json'), 'utf8'));
    expect(index).toMatchObject({
      models: [
        { modelKey: 'bench', file: 'models/bench.glb' },
        { modelKey: 'lawn', file: 'models/lawn.glb' },
      ],
    });
  });

  it('keeps entries for other models when run with --only', async () => {
    await runPipeline(paths, { only: ['bench'], placeholdersOnly: false }, tools);
    await runPipeline(paths, { only: ['lawn'], placeholdersOnly: false }, tools);
    expect(readManifest().models.map((entry) => entry.modelKey)).toEqual(['bench', 'lawn']);
  });

  it('uses placeholders for every model when offline', async () => {
    const report = await runPipeline(paths, { only: ['bench'], placeholdersOnly: true }, tools);
    expect(report[0]?.placeholder).toBe(true);
  });

  it('builds every target when no key is given', async () => {
    const report = await runPipeline(paths, { only: [], placeholdersOnly: true }, tools);
    expect(report.length).toBeGreaterThan(30);
  }, 30_000);

  it('rejects a key that is not in the catalog', async () => {
    mkdirSync(paths.outputDir, { recursive: true });
    await expect(
      runPipeline(paths, { only: ['unicorn'], placeholdersOnly: false }, tools),
    ).rejects.toThrow(/unicorn/);
  });
});
