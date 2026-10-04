import { useLayoutEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { BufferAttribute } from 'three';

import type { Heightmap } from '@parkshape/core';

import { pathSurfaceTint } from '../editor/path-draft.js';
import { ribbonUvs } from '../geometry/ribbon-uv.js';
import { buildRibbon } from '../geometry/ribbon.js';
import type { ScenePalette } from '../palette/colours.js';
import type { Toggle } from '../perf/render-tier.js';
import type { MeshArrays, PathFeature, PathSurface } from '../types.js';

import { FeatureMesh } from './FeatureMesh.js';
import { useSurfaceMap } from './surface-textures.js';
import type { SurfaceMap } from './surface-textures.js';
import { useBufferGeometry } from './use-buffer-geometry.js';

const UV_SIZE = 2;
// DESIGN.md "Ground, paths and water": path maps repeat every 1 m.
const PATH_TILE = { tileM: 1 } as const;
const PATH_ROUGHNESS = 0.8;
// Pulls the ribbon toward the camera in the depth test so it does not flicker on the terrain.
const DEPTH_NUDGE = -1;
const DEFAULT_SURFACE: PathSurface = 'gravel';

const SURFACE_MAPS: Readonly<Record<PathSurface, SurfaceMap>> = {
  asphalt: 'asphalt-detail',
  gravel: 'gravel-detail',
  boardwalk: 'boardwalk-detail',
};

export interface PathRibbonsProps {
  readonly heightmap: Heightmap;
  readonly paths: readonly PathFeature[];
  readonly palette: ScenePalette;
  /** Surface textures, desktop tier only; the phone tier draws flat tints. */
  readonly detail: Toggle;
}

interface RibbonProps {
  readonly arrays: MeshArrays;
  readonly surface: PathSurface;
  readonly tint: string;
}

/** One path with its greyscale surface map multiplied by the tint; suspends while it loads. */
function TexturedRibbon({ arrays, surface, tint }: RibbonProps): ReactElement {
  const geometry = useBufferGeometry(arrays);
  const map = useSurfaceMap(SURFACE_MAPS[surface], PATH_TILE);
  useLayoutEffect(() => {
    geometry.setAttribute('uv', new BufferAttribute(ribbonUvs(arrays), UV_SIZE));
  }, [geometry, arrays]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={tint}
        map={map}
        roughness={PATH_ROUGHNESS}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={DEPTH_NUDGE}
        polygonOffsetUnits={DEPTH_NUDGE}
      />
    </mesh>
  );
}

export function PathRibbons({ heightmap, paths, palette, detail }: PathRibbonsProps): ReactElement {
  const ribbons = useMemo(
    () =>
      paths.map((path) => ({
        id: path.id,
        surface: path.surface ?? DEFAULT_SURFACE,
        arrays: buildRibbon(heightmap, path.points, path),
      })),
    [heightmap, paths],
  );
  return (
    <>
      {ribbons.map(({ id, arrays, surface }) =>
        detail === 'on' ? (
          <TexturedRibbon
            key={id}
            arrays={arrays}
            surface={surface}
            tint={pathSurfaceTint(surface, palette)}
          />
        ) : (
          <FeatureMesh
            key={id}
            arrays={arrays}
            colour={pathSurfaceTint(surface, palette)}
            roughness={PATH_ROUGHNESS}
          />
        ),
      )}
    </>
  );
}
