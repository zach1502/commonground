import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  MeshBasicMaterial,
  RGBAFormat,
  SRGBColorSpace,
} from 'three';

import type { Heightmap } from '@parkshape/core';

import { buildDrapeArrays, type HeatGridFrame } from '../heatmap/drape.js';
import { heatShades, singleHueRamp } from '../heatmap/heat-ramp.js';
import { heatTexture } from '../heatmap/heat-upsample.js';
import { documentPropertyReader, readPalette } from '../palette/colours.js';

import { inverseAcesFilmic } from './tone.js';
import { useDisposable } from './use-disposable.js';

const VECTOR_SIZE = 3;
const UV_SIZE = 2;
// Enough to clear float32 terrain without looking like it floats.
const LIFT_M = 0.08;

/** A heat grid: shares 0 to 1, row by row from the south-west corner; the peak draws darkest. */
export interface HeatGrid extends HeatGridFrame {
  readonly values: ArrayLike<number>;
}

export interface HeatmapOverlayProps {
  readonly heightmap: Heightmap;
  readonly grid: HeatGrid;
  /** 0 to 1, applied as the material's opacity uniform. */
  readonly opacity: number;
}

function useDrapeGeometry(heightmap: Heightmap, frame: HeatGridFrame): BufferGeometry {
  const geometry = useMemo(() => {
    const arrays = buildDrapeArrays(heightmap, frame, { liftM: LIFT_M });
    const built = new BufferGeometry();
    built.setAttribute('position', new BufferAttribute(arrays.positions, VECTOR_SIZE));
    built.setAttribute('uv', new BufferAttribute(arrays.uvs, UV_SIZE));
    built.setIndex(new BufferAttribute(arrays.indices, 1));
    built.computeBoundingSphere();
    return built;
  }, [heightmap, frame]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  return geometry;
}

/**
 * The renderer's tone mapping exposure, which the tier sets after mount; follows later changes,
 * such as a decline to the phone tier.
 */
function useToneExposure(): number {
  const gl = useThree((state) => state.gl);
  const [exposure, setExposure] = useState(gl.toneMappingExposure);
  useFrame(() => {
    if (gl.toneMappingExposure !== exposure) setExposure(gl.toneMappingExposure);
  });
  return exposure;
}

/**
 * Drapes a heat grid over the terrain as a texture with adjustable opacity. The ramp is one hue,
 * the domain palette's water blue, which reads clearly on the grass. Both tiers tone map with
 * ACES, which would pull the blue toward grey, so the shades are stored with the curve undone and
 * the busiest cell shows the palette colour itself. Fog is off, so the far side does not fade.
 */
export function HeatmapOverlay(props: HeatmapOverlayProps): ReactElement {
  const { heightmap, grid, opacity } = props;
  const geometry = useDrapeGeometry(heightmap, grid);
  const colour = useMemo(() => readPalette(documentPropertyReader()).water, []);
  const invalidate = useThree((state) => state.invalidate);
  const exposure = useToneExposure();
  const [, material] = useDisposable(() => {
    const shades = heatShades(singleHueRamp(colour), (linear) =>
      inverseAcesFilmic(linear, exposure),
    );
    const texture = heatTexture(grid, shades);
    const built = new DataTexture(texture.data, texture.width, texture.height, RGBAFormat);
    built.magFilter = LinearFilter;
    built.minFilter = LinearFilter;
    // The shade bytes are sRGB encoded, like the palette tokens they come from.
    built.colorSpace = SRGBColorSpace;
    built.needsUpdate = true;
    const drape = new MeshBasicMaterial({
      map: built,
      transparent: true,
      fog: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    return [built, drape] as const;
  }, [grid, colour, exposure]);
  useEffect(() => {
    material.opacity = opacity;
    invalidate();
  }, [material, opacity, invalidate]);
  return <mesh geometry={geometry} material={material} />;
}
