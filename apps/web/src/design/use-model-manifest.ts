import { useEffect, useState } from 'react';

import { assetManifestFromModels, type AssetManifest } from '@parkshape/scene/plan';

// Written by the asset pipeline next to the GLBs in the public folder.
const MODELS_INDEX = '/models/index.json';

export type ModelManifestState =
  { readonly state: 'loading' } | { readonly state: 'ready'; readonly manifest: AssetManifest };

/** The models index; with no index every item draws as its placeholder shape. */
export async function fetchModelManifest(): Promise<AssetManifest> {
  try {
    const response = await fetch(MODELS_INDEX);
    return assetManifestFromModels(response.ok ? await response.json() : null, '/');
  } catch {
    return assetManifestFromModels(null, '/');
  }
}

/**
 * The GLB models for the read-only viewer. The viewer waits for this, so its ready signal comes
 * after the real models load, not after the placeholder shapes.
 */
export function useModelManifest(): ModelManifestState {
  const [manifest, setManifest] = useState<ModelManifestState>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    void fetchModelManifest().then((loaded) => {
      if (live) setManifest({ state: 'ready', manifest: loaded });
    });
    return () => {
      live = false;
    };
  }, []);
  return manifest;
}
