import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { buildModel, type BuildResult, type BuildTools } from './build.js';
import {
  modelsManifestSchema,
  sourceManifestSchema,
  type ModelEntry,
  type SourceManifest,
} from './manifest-schema.js';
import { writeManifestEntry } from './pipeline.js';
import { assetTargets, type AssetTarget } from './targets.js';

export interface RunPaths {
  readonly sourceManifest: string;
  readonly modelsManifest: string;
  readonly outputDir: string;
}

export interface RunOptions {
  /** Model keys to build; empty builds every catalog and kit model. */
  readonly only: readonly string[];
  /** Skips the network and builds the procedural placeholder for every model. */
  readonly placeholdersOnly: boolean;
}

const MANIFEST_NOTE =
  'Written by pnpm --filter @parkshape/asset-pipeline build-assets from manifest.json. Do not edit by hand.';
const INDEX_NOTE =
  'Written by the asset pipeline from tools/asset-pipeline/generated/models.manifest.json. Do not edit by hand.';
export const MODEL_INDEX_FILE = 'index.json';

/** Reads the CLI flags: repeatable --only <modelKey> and --placeholders-only. */
export function parseArgs(argv: readonly string[]): RunOptions {
  const only: string[] = [];
  let placeholdersOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--placeholders-only') {
      placeholdersOnly = true;
    } else if (flag === '--only') {
      const key = argv[index + 1];
      if (key === undefined || key.startsWith('--')) throw new Error('--only needs a model key');
      only.push(key);
      index += 1;
    } else {
      throw new Error(`Unknown flag ${String(flag)}`);
    }
  }
  return { only, placeholdersOnly };
}

function selectTargets(only: readonly string[]): readonly AssetTarget[] {
  const targets = assetTargets();
  const known = new Set(targets.map((target) => target.modelKey));
  const unknown = only.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(`Not a catalog model key: ${unknown.join(', ')}`);
  }
  return only.length === 0 ? targets : targets.filter((target) => only.includes(target.modelKey));
}

function readExisting(path: string): readonly ModelEntry[] {
  if (!existsSync(path)) return [];
  const parsed = modelsManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return parsed.success ? parsed.data.models : [];
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const config = (await resolveConfig(path)) ?? {};
  writeFileSync(path, await format(JSON.stringify(value), { ...config, parser: 'json' }));
}

// The browser only needs each file path, so the published index leaves out the build details.
function modelIndex(models: readonly ModelEntry[]): unknown {
  return {
    note: INDEX_NOTE,
    models: models.map(({ modelKey, file }) => ({ modelKey, file })),
  };
}

function readSourceManifest(path: string): SourceManifest {
  return sourceManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Builds the selected models, writes their GLBs and merges their entries into the manifest. */
export async function runPipeline(
  paths: RunPaths,
  options: RunOptions,
  tools: BuildTools,
): Promise<BuildResult[]> {
  const targets = selectTargets(options.only);
  const sources = readSourceManifest(paths.sourceManifest);
  mkdirSync(paths.outputDir, { recursive: true });
  const results: BuildResult[] = [];
  for (const target of targets) {
    const model = options.placeholdersOnly
      ? undefined
      : sources.models.find((entry) => entry.modelKey === target.modelKey);
    const result = await buildModel(target, model, tools);
    writeFileSync(join(paths.outputDir, `${target.modelKey}.glb`), result.glb);
    results.push(result);
  }
  const known = new Set(assetTargets().map((target) => target.modelKey));
  const merged = results
    .reduce(
      (entries, result) => writeManifestEntry(entries, result.entry),
      readExisting(paths.modelsManifest),
    )
    .filter((entry) => known.has(entry.modelKey));
  await writeJson(paths.modelsManifest, { note: MANIFEST_NOTE, models: merged });
  await writeJson(join(paths.outputDir, MODEL_INDEX_FILE), modelIndex(merged));
  return results;
}
