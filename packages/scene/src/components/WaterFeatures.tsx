import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { BufferAttribute } from 'three';

import type { Heightmap } from '@parkshape/core';

import { metreUvs } from '../geometry/uv.js';
import { buildWaterDisc, waterOffsets } from '../geometry/water.js';
import type { ScenePalette } from '../palette/colours.js';
import type { MeshArrays, WaterFeature } from '../types.js';

import { useBufferGeometry } from './use-buffer-geometry.js';
import { waterMaterial } from './water-material.js';
import type { WaterMaterial } from './water-material.js';

const UV_SIZE = 2;

export interface WaterFeaturesProps {
  readonly heightmap: Heightmap;
  readonly water: readonly WaterFeature[];
  readonly palette: ScenePalette;
  /** 'still' on the phone tier and with reduced motion. */
  readonly motion: 'animated' | 'still';
}

function Pond({ arrays, water }: { readonly arrays: MeshArrays; readonly water: WaterMaterial }) {
  const geometry = useBufferGeometry(arrays);
  useLayoutEffect(() => {
    geometry.setAttribute('uv', new BufferAttribute(metreUvs(arrays.positions), UV_SIZE));
  }, [geometry, arrays]);
  return <mesh geometry={geometry} material={water.material} receiveShadow />;
}

/** Scrolls the ripples each frame and asks for the next one, so it also runs on demand. */
function Ripples({ water }: { readonly water: WaterMaterial }): null {
  const invalidate = useThree((state) => state.invalidate);
  useFrame(({ clock }) => {
    const [first, second] = waterOffsets(clock.elapsedTime, 'animated');
    if (first !== undefined) water.normalMap.offset.set(first.x, first.y);
    if (second !== undefined) water.secondOffset.value.set(second.x, second.y);
    invalidate();
  });
  return null;
}

export function WaterFeatures({
  heightmap,
  water,
  palette,
  motion,
}: WaterFeaturesProps): ReactElement {
  const discs = useMemo(
    () => water.map((pond) => ({ id: pond.id, disc: buildWaterDisc(heightmap, pond.outline, {}) })),
    [heightmap, water],
  );
  const material = useMemo(
    () => waterMaterial({ water: palette.water, sky: palette.sky }, motion),
    [palette.water, palette.sky, motion],
  );
  useEffect(
    () => () => {
      material.material.dispose();
      material.normalMap.dispose();
    },
    [material],
  );
  return (
    <>
      {discs.map(({ id, disc }) => (
        <Pond key={id} arrays={disc.mesh} water={material} />
      ))}
      {motion === 'animated' && discs.length > 0 ? <Ripples water={material} /> : null}
    </>
  );
}
