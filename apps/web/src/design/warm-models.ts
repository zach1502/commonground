import { catalogIndex } from '@parkshape/core';
import type { AssetManifest } from '@parkshape/scene/plan';

import { fetchModelManifest } from './use-model-manifest';

type FetchFile = (url: string) => Promise<unknown>;

function catalogIdsOf(document: unknown): string[] {
  if (typeof document !== 'object' || document === null) return [];
  const { items } = document as { readonly items?: unknown };
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown) => {
    const id = (item as { readonly catalogId?: unknown } | null)?.catalogId;
    return typeof id === 'string' ? [id] : [];
  });
}

/** The model file of each item kind the design places, once each. */
export function modelUrlsFor(document: unknown, manifest: AssetManifest): string[] {
  const urls = catalogIdsOf(document).flatMap((id) => {
    const key = catalogIndex.get(id)?.modelKey;
    const url = key === undefined ? undefined : manifest[key]?.url;
    return url === undefined ? [] : [url];
  });
  return [...new Set(urls)];
}

/**
 * Starts the design's model downloads while three.js is still arriving. The 3D view asks for the
 * same URLs once it runs, and the browser cache answers, so the models no longer wait for it.
 */
export function warmModels(
  document: unknown,
  manifest: AssetManifest,
  fetchFile: FetchFile = async (url) => fetch(url),
): void {
  for (const url of modelUrlsFor(document, manifest)) {
    fetchFile(url).catch(() => undefined);
  }
}

/** Reads the models index, then warms the design's models; for pages that open a 3D view. */
export function warmDesignModels(document: unknown): void {
  void fetchModelManifest().then((manifest) => {
    warmModels(document, manifest);
  });
}
