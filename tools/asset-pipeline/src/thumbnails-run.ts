import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { writeJson } from './run.js';
import {
  hashOf,
  THUMBNAIL_DIR,
  thumbnailFile,
  thumbnailManifest,
  thumbnailManifestSchema,
  thumbnailPlan,
  type ThumbnailEntry,
  type ThumbnailItem,
  type ThumbnailManifest,
} from './thumbnails.js';

export interface ThumbnailPaths {
  /** The web app's public folder, ending in a slash; models and pictures live under it. */
  readonly publicDir: string;
  readonly manifest: string;
  readonly modelsManifest: string;
}

export interface ThumbnailRunOptions {
  /** 'all' draws every picture again; 'changed' draws only stale or missing ones. */
  readonly redraw: 'all' | 'changed';
}

/** The browser page that draws the pictures, as the CLI drives it. */
export interface ThumbnailRenderer {
  /** The camera, light and size settings the page draws with. */
  readonly settings: () => Promise<unknown>;
  /** One PNG for a model, loaded from a URL under the public folder. */
  readonly render: (modelKey: string, url: string) => Promise<Uint8Array>;
}

export interface ThumbnailTools {
  readonly items: readonly ThumbnailItem[];
  readonly renderer: ThumbnailRenderer;
  readonly log: (line: string) => void;
}

export interface ThumbnailSummary {
  readonly drawn: number;
  readonly unchanged: number;
}

// Only the file path of each processed model matters here; the other fields are left alone.
const modelFilesSchema = z.object({
  models: z.array(z.object({ modelKey: z.string(), file: z.string() })),
});

/** Reads the CLI flags: --force draws every picture again. */
export function parseThumbnailArgs(argv: readonly string[]): ThumbnailRunOptions {
  const unknown = argv.filter((flag) => flag !== '--force');
  if (unknown.length > 0) throw new Error(`Unknown flag ${unknown.join(' ')}`);
  return { redraw: argv.includes('--force') ? 'all' : 'changed' };
}

export function settingsHashOf(settings: unknown): string {
  return hashOf(JSON.stringify(settings));
}

function readExisting(path: string): ThumbnailManifest | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = thumbnailManifestSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return parsed.success ? parsed.data : undefined;
}

function modelFiles(path: string): ReadonlyMap<string, string> {
  const { models } = modelFilesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  return new Map(models.map((model) => [model.modelKey, model.file]));
}

/** Entries from the old manifest that this run did not draw again, then the fresh ones. */
function mergedEntries(
  existing: ThumbnailManifest | undefined,
  drawn: readonly ThumbnailEntry[],
): ThumbnailEntry[] {
  const fresh = new Set(drawn.map((entry) => entry.itemId));
  const kept = (existing?.thumbnails ?? []).filter((entry) => !fresh.has(entry.itemId));
  return [...kept, ...drawn];
}

/**
 * Draws the catalog pictures that are missing or stale, writes them under the public folder and
 * rewrites the thumbnail manifest.
 */
export async function runThumbnails(
  paths: ThumbnailPaths,
  options: ThumbnailRunOptions,
  tools: ThumbnailTools,
): Promise<ThumbnailSummary> {
  const files = modelFiles(paths.modelsManifest);
  const modelHashes = new Map(
    [...files].map(([key, file]) => [key, hashOf(readFileSync(`${paths.publicDir}${file}`))]),
  );
  const existing = options.redraw === 'all' ? undefined : readExisting(paths.manifest);
  const settingsHash = settingsHashOf(await tools.renderer.settings());
  const plan = thumbnailPlan({
    items: tools.items,
    modelHashes,
    existing,
    settingsHash,
    present: (file) => existsSync(`${paths.publicDir}${file}`),
  });
  mkdirSync(`${paths.publicDir}${THUMBNAIL_DIR}`, { recursive: true });
  const drawn: ThumbnailEntry[] = [];
  for (const item of plan.render) {
    const png = await tools.renderer.render(item.modelKey, `/${files.get(item.modelKey) ?? ''}`);
    const file = thumbnailFile(item.id);
    writeFileSync(`${paths.publicDir}${file}`, png);
    drawn.push({
      itemId: item.id,
      modelKey: item.modelKey,
      file,
      modelHash: item.modelHash,
      bytes: png.length,
    });
    tools.log(`${item.id}\t${String(png.length)} B`);
  }
  const entries = mergedEntries(existing, drawn);
  await writeJson(paths.manifest, thumbnailManifest(tools.items, entries, settingsHash));
  const summary = { drawn: drawn.length, unchanged: tools.items.length - drawn.length };
  tools.log(`${String(summary.drawn)} drawn, ${String(summary.unchanged)} unchanged`);
  return summary;
}
