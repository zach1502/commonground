import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { PerspectiveCamera, Vector3, type Group } from 'three';

import { FIELD_OF_VIEW_DEG } from '../../camera/presets.js';
import { BRUSH_HALO_PX, BRUSH_RING_PX, ghostMarkerRadiusM } from '../../editor/overlay-style.js';

import { LIFT_M } from './editor-view.js';

const RING_SEGMENTS = 48;
const FULL_TURN = Math.PI + Math.PI;
// A unit circle; the group scales it uniformly to the marker radius each frame.
const UNIT_RING: [number, number, number][] = Array.from(
  { length: RING_SEGMENTS + 1 },
  (_, index) => {
    const angle = (index / RING_SEGMENTS) * FULL_TURN;
    return [Math.cos(angle), 0, Math.sin(angle)];
  },
);
const eye = new Vector3();
const centre = new Vector3();

export interface GhostMarkerProps {
  readonly at: readonly [number, number, number];
  readonly footprint: { readonly widthM: number; readonly depthM: number };
  readonly colour: string;
  readonly halo: string;
}

/**
 * A ring in the ghost's colour on a light halo, so a small item stays easy to find at any zoom.
 * The ring grows so it never drops under GHOST_MIN_PX on screen; the ghost mesh keeps its size.
 */
export function GhostMarker({ at, footprint, colour, halo }: GhostMarkerProps): ReactElement {
  const group = useRef<Group>(null);
  useFrame(({ camera, size }) => {
    const current = group.current;
    if (current === null) return;
    const distanceM = camera.getWorldPosition(eye).distanceTo(current.getWorldPosition(centre));
    const fovDeg = camera instanceof PerspectiveCamera ? camera.fov : FIELD_OF_VIEW_DEG;
    const radius = ghostMarkerRadiusM(footprint, {
      distanceM,
      fovDeg,
      viewportHeightPx: size.height,
    });
    current.scale.setScalar(radius);
  });
  return (
    <group ref={group} position={[at[0], at[1] + LIFT_M, at[2]]}>
      <Line
        points={UNIT_RING}
        color={halo}
        lineWidth={BRUSH_HALO_PX}
        depthTest={false}
        renderOrder={3}
      />
      <Line
        points={UNIT_RING}
        color={colour}
        lineWidth={BRUSH_RING_PX}
        depthTest={false}
        renderOrder={4}
      />
    </group>
  );
}
