import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Texture } from 'three';

import { surfaceMapUrl, type SurfaceMap } from './surface-maps.js';

export type { SurfaceMap } from './surface-maps.js';
// research-3d.md: anisotropy 8, or the device maximum when that is lower.
const MAX_ANISOTROPY = 8;

export interface MapLayout {
  /** Metres one tile of the map covers; the UVs are in metres. */
  readonly tileM: number;
}

function configure(texture: Texture, map: SurfaceMap, layout: MapLayout, anisotropy: number): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / layout.tileM, 1 / layout.tileM);
  texture.anisotropy = anisotropy;
  // Detail maps carry colour; normal maps are data and stay linear.
  texture.colorSpace = map.endsWith('normal') ? LinearSRGBColorSpace : SRGBColorSpace;
  texture.needsUpdate = true;
}

/**
 * Starts every map's download now. Each useSurfaceMap call suspends on its own map, so without
 * this the second map in a component waits for the first to arrive.
 */
export function preloadSurfaceMaps(maps: readonly SurfaceMap[]): void {
  for (const map of maps) useTexture.preload(surfaceMapUrl(map));
}

/** Loads one surface map, set to repeat in metres; suspends until the file has loaded. */
export function useSurfaceMap(map: SurfaceMap, layout: MapLayout): Texture {
  const texture = useTexture(surfaceMapUrl(map));
  const gl = useThree((state) => state.gl);
  const anisotropy = Math.min(MAX_ANISOTROPY, gl.capabilities.getMaxAnisotropy());
  useLayoutEffect(() => {
    configure(texture, map, layout, anisotropy);
  }, [texture, map, layout, anisotropy]);
  return texture;
}
