import { useEffect, useState } from 'react';

import type { AssetManifest } from '../types.js';

import { assetManifestFromModels } from './model-manifest.js';

// Written by the asset pipeline next to the GLBs in the web app's public folder.
const MODELS_INDEX = '/models/index.json';
const PUBLIC_BASE = '/';

export type ModelManifestState =
  { readonly state: 'loading' } | { readonly state: 'ready'; readonly manifest: AssetManifest };

export type ManifestLoader = () => Promise<AssetManifest>;
type FetchIndex = (url: string) => Promise<Response>;

/**
 * Reads the models index once and hands every later caller the same manifest. A missing or
 * unreadable index settles on an empty manifest, and every item draws as its placeholder.
 */
export function modelsIndexLoader(fetchIndex: FetchIndex): ManifestLoader {
  let pending: Promise<AssetManifest> | undefined;
  return () => {
    pending ??= fetchIndex(MODELS_INDEX)
      .then(async (response): Promise<unknown> => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((json) => assetManifestFromModels(json, PUBLIC_BASE));
    return pending;
  };
}

const loadModelsIndex = modelsIndexLoader(async (url) => fetch(url));

/**
 * The GLB models for any scene view: the manifest the caller passes, or the web app's models
 * index when it passes none. The editor, the design page viewer and the insights viewer all go
 * through this, so each draws the same models.
 */
export function useModelManifest(
  given: AssetManifest | undefined,
  load: ManifestLoader = loadModelsIndex,
): ModelManifestState {
  const [loaded, setLoaded] = useState<AssetManifest | undefined>(undefined);
  useEffect(() => {
    if (given !== undefined) return undefined;
    let live: 'live' | 'gone' = 'live';
    void load().then((manifest) => {
      if (live === 'live') setLoaded(manifest);
    });
    return () => {
      live = 'gone';
    };
  }, [given, load]);
  const manifest = given ?? loaded;
  return manifest === undefined ? { state: 'loading' } : { state: 'ready', manifest };
}
