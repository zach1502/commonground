import { useEffect, useState } from 'react';

import type { Heightmap } from '@parkshape/core';

import type { WebApi } from '../api/web-api';

export type TerrainApi = Pick<WebApi, 'getTerrain'>;

/** Ready with no heightmap when the terrain did not load, so the view draws the flat parcel. */
export type ProjectTerrainState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly heightmap: Heightmap | undefined };

/**
 * The project's recorded ground for a live 3D view, so the view shows the same slopes and soil
 * banks as the still pictures. The view waits for it, like it waits for the models index.
 */
export function useProjectTerrain(api: TerrainApi, projectId: string): ProjectTerrainState {
  const [terrain, setTerrain] = useState<ProjectTerrainState>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    const settle = (heightmap: Heightmap | undefined) => {
      if (live) setTerrain({ state: 'ready', heightmap });
    };
    api.getTerrain(projectId).then(settle, () => {
      settle(undefined);
    });
    return () => {
      live = false;
    };
  }, [api, projectId]);
  return terrain;
}
