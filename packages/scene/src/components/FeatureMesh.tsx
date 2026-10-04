import type { ReactElement } from 'react';

import type { MeshArrays } from '../types.js';

import { useBufferGeometry } from './use-buffer-geometry.js';

// Pulls ground overlays toward the camera in the depth test so they do not flicker on the terrain.
const DEPTH_NUDGE = -1;

export interface FeatureMeshProps {
  readonly arrays: MeshArrays;
  readonly colour: string;
  readonly roughness?: number;
}

/** Flat overlay on the terrain, such as a path, an area fill or a pond. */
export function FeatureMesh({ arrays, colour, roughness = 1 }: FeatureMeshProps): ReactElement {
  const geometry = useBufferGeometry(arrays);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={colour}
        roughness={roughness}
        polygonOffset
        polygonOffsetFactor={DEPTH_NUDGE}
        polygonOffsetUnits={DEPTH_NUDGE}
      />
    </mesh>
  );
}
