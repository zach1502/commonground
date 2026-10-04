import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry } from 'three';

import type { InstanceGroup } from '../geometry/instances.js';
import { blobShadows } from '../geometry/shadow-casters.js';

import { InstancedPart } from './InstancedPart.js';
import { useDisposable } from './use-disposable.js';

// DESIGN.md "Shadows": blobs at 0.35 opacity are the only shadow on the phone tier.
const BLOB_OPACITY = 0.35;
const TEXTURE_PX = 64;
const HALF = 0.5;
const QUARTER_TURN = Math.PI * HALF;
// The shadow stays dark to 40 percent of the radius, then fades out to the edge.
const CORE_STOP = 0.4;
const SHADOW_INK = 'rgba(20, 28, 18, 1)';
const CLEAR_INK = 'rgba(20, 28, 18, 0)';

/** A soft round shadow drawn at runtime, so nothing is downloaded. */
function blobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const context = canvas.getContext('2d');
  const centre = TEXTURE_PX * HALF;
  if (context !== null) {
    const fade = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
    fade.addColorStop(0, SHADOW_INK);
    fade.addColorStop(CORE_STOP, SHADOW_INK);
    fade.addColorStop(1, CLEAR_INK);
    context.fillStyle = fade;
    context.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  }
  return new CanvasTexture(canvas);
}

export interface BlobShadowsProps {
  readonly groups: ReadonlyMap<string, InstanceGroup>;
}

/** One instanced quad under every tree: a single draw call for all the blobs. */
export function BlobShadows({ groups }: BlobShadowsProps): ReactElement | null {
  const transforms = useMemo(() => blobShadows(groups), [groups]);
  const [geometry, , material] = useDisposable(() => {
    const quad = new PlaneGeometry(1, 1).rotateX(-QUARTER_TURN);
    const map = blobTexture();
    const ink = new MeshBasicMaterial({
      map,
      transparent: true,
      opacity: BLOB_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    return [quad, map, ink] as const;
  }, []);
  if (transforms.length === 0) return null;
  return (
    <InstancedPart
      key={String(transforms.length)}
      geometry={geometry}
      material={material}
      transforms={transforms}
      shadow="none"
    />
  );
}
