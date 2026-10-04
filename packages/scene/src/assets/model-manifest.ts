import type { AssetManifest } from '../types.js';

interface ModelFile {
  readonly modelKey: string;
  readonly file: string;
}

function isModelFile(entry: unknown): entry is ModelFile {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const { modelKey, file } = entry as Partial<Record<keyof ModelFile, unknown>>;
  return typeof modelKey === 'string' && typeof file === 'string';
}

function modelList(manifest: unknown): readonly unknown[] {
  if (typeof manifest !== 'object' || manifest === null) {
    return [];
  }
  const { models } = manifest as { models?: unknown };
  return Array.isArray(models) ? models : [];
}

/**
 * Model URLs from the asset pipeline's models manifest ({ models: [{ modelKey, file }] }). Files
 * are relative to the web app's public folder, so the base URL is where that folder is served.
 * Entries without a model key or file are skipped, and the viewer draws a placeholder for them.
 */
export function assetManifestFromModels(manifest: unknown, baseUrl: string): AssetManifest {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return Object.fromEntries(
    modelList(manifest)
      .filter(isModelFile)
      .map((entry) => [entry.modelKey, { url: `${base}${entry.file}` }]),
  );
}
