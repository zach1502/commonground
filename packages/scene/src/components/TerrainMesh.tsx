import { useLayoutEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { BufferAttribute, MeshStandardMaterial, Vector2 } from 'three';
import type { BufferGeometry } from 'three';

import type { Heightmap } from '@parkshape/core';

import { buildGroundMesh } from '../geometry/ground-mesh.js';
import { terrainColours } from '../geometry/terrain-colours.js';
import { ISLAND_SKIRT_DEPTH_M } from '../geometry/terrain-mesh.js';
import { metreUvs } from '../geometry/uv.js';
import { VECTOR_SIZE } from '../geometry/vector-layout.js';
import type { ScenePalette } from '../palette/colours.js';
import type { Toggle } from '../perf/render-tier.js';
import type { GroundPoint } from '../types.js';

import { GROUND_MAPS } from './surface-maps.js';
import { preloadSurfaceMaps, useSurfaceMap } from './surface-textures.js';
import { useBufferGeometry } from './use-buffer-geometry.js';
import { useDisposable } from './use-disposable.js';

const SURFACE_MATERIAL = 0;
const SKIRT_MATERIAL = 1;
const UV_SIZE = 2;
// DESIGN.md "Ground": the greyscale detail map repeats every 4 m.
const DETAIL_TILE = { tileM: 4 } as const;
const DETAIL_NORMAL_SCALE = 0.3;
// DESIGN.md: roughness is 0.5 or more on every surface except water.
const GRASS_ROUGHNESS = 0.95;
const SKIRT_ROUGHNESS = 1;

export interface TerrainMeshProps {
  readonly heightmap: Heightmap;
  readonly palette: ScenePalette;
  /** Garden bed outlines, drawn in soilDark. */
  readonly beds: readonly (readonly GroundPoint[])[];
  /** Detail and normal maps on the grass; desktop tier only. */
  readonly detail: Toggle;
}

function useGroundAttributes(geometry: BufferGeometry, colours: Float32Array): void {
  useLayoutEffect(() => {
    const positions = geometry.getAttribute('position').array as Float32Array;
    geometry.setAttribute('color', new BufferAttribute(colours, VECTOR_SIZE));
    geometry.setAttribute('uv', new BufferAttribute(metreUvs(positions), UV_SIZE));
  }, [geometry, colours]);
}

interface DetailProps {
  readonly material: MeshStandardMaterial;
}

/** Adds the grass grain and its normal map; suspends while the two maps load. */
function TerrainDetail({ material }: DetailProps): null {
  preloadSurfaceMaps(GROUND_MAPS);
  const map = useSurfaceMap('grass-detail', DETAIL_TILE);
  const normalMap = useSurfaceMap('grass-normal', DETAIL_TILE);
  useLayoutEffect(() => {
    material.map = map;
    material.normalMap = normalMap;
    material.normalScale = new Vector2(DETAIL_NORMAL_SCALE, DETAIL_NORMAL_SCALE);
    material.needsUpdate = true;
  }, [material, map, normalMap]);
  return null;
}

export function TerrainMesh({ heightmap, palette, beds, detail }: TerrainMeshProps): ReactElement {
  const arrays = useMemo(
    () => buildGroundMesh(heightmap, { skirtDepthM: ISLAND_SKIRT_DEPTH_M }),
    [heightmap],
  );
  const colours = useMemo(
    () => terrainColours(heightmap, palette, { beds, mesh: arrays }),
    [heightmap, palette, beds, arrays],
  );
  const geometry = useBufferGeometry(arrays);
  useGroundAttributes(geometry, colours);
  useLayoutEffect(() => {
    const surface = arrays.surfaceIndexCount;
    geometry.clearGroups();
    geometry.addGroup(0, surface, SURFACE_MATERIAL);
    geometry.addGroup(surface, arrays.indices.length - surface, SKIRT_MATERIAL);
  }, [geometry, arrays]);
  const materials = useDisposable(
    () => [
      new MeshStandardMaterial({ vertexColors: true, roughness: GRASS_ROUGHNESS, metalness: 0 }),
      new MeshStandardMaterial({
        color: palette.soilDark,
        roughness: SKIRT_ROUGHNESS,
        metalness: 0,
      }),
    ],
    [palette],
  );
  return (
    <>
      <mesh geometry={geometry} material={materials} receiveShadow />
      {detail === 'on' && materials[0] !== undefined ? (
        <TerrainDetail material={materials[0]} />
      ) : null}
    </>
  );
}
