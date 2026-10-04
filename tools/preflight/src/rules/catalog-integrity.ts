import { catalogEntries, type CatalogEntry } from '../catalog-entries.js';
import { fileExists, listRepoFiles, lineOf, readJson, readText, selectFiles } from '../files.js';
import { notApplicable } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'catalog-integrity';
const CATALOG_GLOBS = ['packages/core/src/catalog/**/*.{ts,json}'];
const TEST_FILES = ['**/*.test.ts'];
const MODELS_MANIFEST = 'tools/asset-pipeline/generated/models.manifest.json';
// The editor's picker shows one picture per catalog item; module kit parts are never picked.
const THUMBNAIL_DIR = 'apps/web/public/catalog-thumbs';
const KIT_FILE = /module-kit\.[jt]s$/;
// Manifest dims may differ from the catalog footprint by this share at most.
const DIMS_TOLERANCE = 0.02;
const PERCENT = 100;
const FOOTPRINT_DIMS = ['widthM', 'depthM'] as const;
const ALL_DIMS = ['widthM', 'depthM', 'heightM'] as const;
type DimName = (typeof ALL_DIMS)[number];

/** A manifest model: its id and whatever of dims, scale policy and licence it records. */
export interface ManifestModel {
  readonly id: string;
  readonly widthM?: unknown;
  readonly depthM?: unknown;
  readonly heightM?: unknown;
  /** The axis the pipeline scaled the model to; the other axes keep the model's proportions. */
  readonly fittedAxis?: unknown;
  readonly scalePolicy?: unknown;
  readonly licence?: unknown;
}

function manifestList(manifest: unknown): unknown[] {
  const list = Array.isArray(manifest)
    ? manifest
    : (manifest as { models?: unknown } | undefined)?.models;
  return Array.isArray(list) ? list : [];
}

interface RawModel {
  readonly id?: unknown;
  readonly modelKey?: unknown;
  readonly dims?: {
    readonly widthM?: unknown;
    readonly depthM?: unknown;
    readonly heightM?: unknown;
  };
}

/**
 * Manifest models, from an array or { models: [...] }. A bare string is a model id. An entry
 * names its model with id or modelKey, and gives dims at the top level or under dims, as the
 * asset pipeline writes them.
 */
export function manifestModels(manifest: unknown): ManifestModel[] {
  return manifestList(manifest).flatMap((entry): ManifestModel[] => {
    if (typeof entry === 'string') return [{ id: entry }];
    if (typeof entry !== 'object' || entry === null) return [];
    const raw = entry as RawModel;
    const id = typeof raw.modelKey === 'string' ? raw.modelKey : raw.id;
    return typeof id === 'string' ? [{ ...entry, ...raw.dims, id }] : [];
  });
}

export function manifestModelIds(manifest: unknown): Set<string> {
  return new Set(manifestModels(manifest).map((model) => model.id));
}

interface Located {
  readonly file: string;
  readonly entry: CatalogEntry;
}

const finding = (file: string, line: number, message: string): Finding => ({
  ruleId: ID,
  file,
  line,
  message,
});

function duplicateIds(entries: readonly Located[]): Finding[] {
  const seen = new Map<string, string>();
  return entries.flatMap(({ file, entry }) => {
    if (entry.id === undefined) return [];
    const first = seen.get(entry.id);
    seen.set(entry.id, first ?? file);
    return first === undefined
      ? []
      : [finding(file, entry.line, `catalog id "${entry.id}" is also used in ${first}`)];
  });
}

function fittedAxisOf(model: ManifestModel): DimName | undefined {
  return ALL_DIMS.find((name) => name === model.fittedAxis);
}

interface DimCheck {
  readonly name: DimName;
  readonly catalog: number;
  readonly manifest: number;
  readonly fitted: DimName | undefined;
}

function dimFinding(located: Located, model: ManifestModel, check: DimCheck): Finding[] {
  const { name, catalog, manifest, fitted } = check;
  const off = Math.abs(manifest - catalog) / catalog;
  if (off <= DIMS_TOLERANCE) return [];
  const values = `is ${String(manifest)} in the manifest and ${String(catalog)} in the catalog`;
  const apart = `${String(Math.round(off * PERCENT))}% apart`;
  const head = `model "${model.id}" ${name} ${values}, ${apart}`;
  const { file, entry } = located;
  if (fitted === undefined || fitted === name) {
    return [finding(file, entry.line, `${head} (limit ${String(DIMS_TOLERANCE * PERCENT)}%)`)];
  }
  // Uniform scaling can match one axis only; a gap on another axis is a proportion question.
  const note = `the pipeline fitted ${fitted}, so this axis follows the model`;
  return [{ ...finding(file, entry.line, `${head}; ${note}`), severity: 'warn' }];
}

/**
 * Compares manifest dims with the catalog footprint. Without a recorded fittedAxis, width and
 * depth must each be within 2%. With one, that axis (height included) must be within 2% and the
 * other footprint axis only warns, because the pipeline never scales a mesh non-uniformly.
 * Trees are fitted on height; their footprint is the trunk, so width and depth are not compared.
 */
function dimFindings(located: Located, model: ManifestModel): Finding[] {
  const fitted = fittedAxisOf(model);
  // A tree's footprint is its trunk, so only the fitted height compares with the model.
  const plan = located.entry.plan === 'trunk' ? [] : FOOTPRINT_DIMS;
  const names = fitted === 'heightM' ? [...plan, fitted] : plan;
  return names.flatMap((name) => {
    const catalog = located.entry.dims[name];
    const manifest = model[name];
    if (catalog === undefined || catalog === 0 || typeof manifest !== 'number') return [];
    return dimFinding(located, model, { name, catalog, manifest, fitted });
  });
}

function entryFindings(located: Located, models: ReadonlyMap<string, ManifestModel>): Finding[] {
  const { file, entry } = located;
  const name = entry.id ?? entry.modelKey;
  const policy =
    entry.scalePolicy === undefined
      ? [finding(file, entry.line, `catalog item "${name}" has no scalePolicy`)]
      : [];
  const model = models.get(entry.modelKey);
  if (model === undefined) {
    const message = `modelKey "${entry.modelKey}" of "${name}" is not in ${MODELS_MANIFEST}`;
    return [...policy, finding(file, entry.line, message)];
  }
  return [...policy, ...dimFindings(located, model)];
}

function thumbnailFindings(rootDir: string, entries: readonly Located[]): Finding[] {
  return entries.flatMap(({ file, entry }) => {
    if (entry.id === undefined || KIT_FILE.test(file)) return [];
    const picture = `${THUMBNAIL_DIR}/${entry.id}.png`;
    if (fileExists(rootDir, picture)) return [];
    return [finding(file, entry.line, `catalog item "${entry.id}" has no picture at ${picture}`)];
  });
}

function manifestFindings(text: string, models: readonly ManifestModel[]): Finding[] {
  return models.flatMap((model) => {
    const index = text.indexOf(`"${model.id}"`);
    const line = index < 0 ? 1 : lineOf(text, index);
    const missing = (['scalePolicy', 'licence'] as const).filter((field) => {
      const value = model[field];
      return typeof value !== 'string' || value.trim() === '';
    });
    return missing.map((field) =>
      finding(MODELS_MANIFEST, line, `model "${model.id}" has no ${field} in ${MODELS_MANIFEST}`),
    );
  });
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'DESIGN.md#placing-items',
  tier: 'standard',
  severity: 'error',
  summary:
    'Catalog ids are unique; each modelKey is in the manifest, within 2% of its footprint, with a scale policy and licence; each item has a picker picture.',
  fixHint:
    'Run the asset pipeline for the model and its thumbnails, or fix the entry in packages/core/src/catalog.',
  check(ctx) {
    const catalog = selectFiles(listRepoFiles(ctx.rootDir), CATALOG_GLOBS, TEST_FILES);
    const manifest = readJson(ctx.rootDir, MODELS_MANIFEST);
    if (catalog.length === 0 || manifest === undefined) {
      return Promise.resolve([
        notApplicable(ID, 'the catalog task adds packages/core/src/catalog and the model manifest'),
      ]);
    }
    const models = manifestModels(manifest);
    const byId = new Map(models.map((model) => [model.id, model]));
    const entries = catalog.flatMap((file) =>
      catalogEntries(readText(ctx.rootDir, file)).map((entry) => ({ file, entry })),
    );
    return Promise.resolve([
      ...duplicateIds(entries),
      ...entries.flatMap((located) => entryFindings(located, byId)),
      ...thumbnailFindings(ctx.rootDir, entries),
      ...manifestFindings(readText(ctx.rootDir, MODELS_MANIFEST), models),
    ]);
  },
};
