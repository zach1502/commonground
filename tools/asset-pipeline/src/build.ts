import { Logger, type Document, type NodeIO } from '@gltf-transform/core';

import { finishMaterials } from './finish.js';
import { CC0, PLACEHOLDER_SOURCE, type ModelEntry, type SourceModel } from './manifest-schema.js';
import {
  bakeNodeTransforms,
  centerOnGround,
  compressModel,
  countTriangles,
  measureBounds,
  rescaleToTarget,
  simplifyToBudget,
  weldModel,
  type Compression,
} from './pipeline.js';
import { placeholderDocument } from './procedural.js';
import { BUDGETS, type AssetTarget } from './targets.js';

export interface BuildTools {
  readonly io: NodeIO;
  readonly simplifier: unknown;
  /** Undefined when the meshopt encoder could not load; the build then only quantizes. */
  readonly encoder: unknown;
  readonly loadSource: (model: SourceModel) => Promise<Document>;
}

export interface BuildResult {
  readonly entry: ModelEntry;
  readonly glb: Uint8Array;
  readonly placeholder: boolean;
  readonly compression: Compression;
  /** Why a listed source was replaced by the placeholder. */
  readonly reason?: string;
}

const PLACEHOLDER_URL = 'tools/asset-pipeline/src/procedural.ts';
const PLACEHOLDER_AUTHOR = 'CommonGround';
// Rounds reported sizes to the millimetre so the manifest stays readable.
const MILLIMETRES = 1000;

export function placeholderCredit(): ModelEntry['source'] {
  return { name: PLACEHOLDER_SOURCE, url: PLACEHOLDER_URL, author: PLACEHOLDER_AUTHOR };
}

interface Loaded {
  readonly document: Document;
  readonly source: ModelEntry['source'];
  readonly yawDeg: number;
  readonly reason?: string;
}

function placeholder(target: AssetTarget, reason?: string): Loaded {
  const loaded = { document: placeholderDocument(target), source: placeholderCredit(), yawDeg: 0 };
  return reason === undefined ? loaded : { ...loaded, reason };
}

async function loadModel(
  target: AssetTarget,
  model: SourceModel | undefined,
  tools: BuildTools,
): Promise<Loaded> {
  if (model === undefined || model.source.name === PLACEHOLDER_SOURCE) {
    return placeholder(target);
  }
  try {
    const { name, url, author } = model.source;
    const document = await tools.loadSource(model);
    return { document, source: { name, url, author }, yawDeg: model.yawDeg };
  } catch (error) {
    return placeholder(target, error instanceof Error ? error.message : String(error));
  }
}

function roundedDims(document: Document): ModelEntry['dims'] {
  const { dims } = measureBounds(document);
  const round = (value: number): number => Math.round(value * MILLIMETRES) / MILLIMETRES;
  return { widthM: round(dims.widthM), depthM: round(dims.depthM), heightM: round(dims.heightM) };
}

/** Runs one model through every pipeline step and returns its GLB and manifest entry. */
export async function buildModel(
  target: AssetTarget,
  model: SourceModel | undefined,
  tools: BuildTools,
): Promise<BuildResult> {
  const loaded = await loadModel(target, model, tools);
  const { document } = loaded;
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  const before = countTriangles(document);
  await bakeNodeTransforms(document, loaded.yawDeg);
  finishMaterials(document, target.modelKey);
  const fit = rescaleToTarget(document, target.dims, target.scalePolicy);
  centerOnGround(document);
  await weldModel(document);
  const budget = BUDGETS[target.budgetClass];
  const after = await simplifyToBudget(document, {
    budget: budget.triangles,
    error: budget.error,
    simplifier: tools.simplifier,
  });
  const dims = roundedDims(document);
  const compression = await compressModel(document, tools.encoder);
  const glb = await tools.io.writeBinary(document);
  const entry: ModelEntry = {
    modelKey: target.modelKey,
    file: `models/${target.modelKey}.glb`,
    dims,
    fittedAxis: fit.fittedAxis,
    triangles: { before, after: Math.min(before, after) },
    bytes: glb.byteLength,
    scalePolicy: target.scalePolicy,
    licence: CC0,
    source: loaded.source,
  };
  const result = {
    entry,
    glb,
    placeholder: loaded.source.name === PLACEHOLDER_SOURCE,
    compression,
  };
  return loaded.reason === undefined ? result : { ...result, reason: loaded.reason };
}
