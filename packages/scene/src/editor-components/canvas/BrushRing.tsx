import { Line } from '@react-three/drei';
import { useRef } from 'react';
import type { ReactElement } from 'react';

import type { PlanePoint } from '@parkshape/core';

import { BRUSH_HALO_PX, BRUSH_RING_PX } from '../../editor/overlay-style.js';
import type { BrushPhase } from '../../motion/level-tween.js';
import { useBrushRingFrames, type FadedLine } from '../../motion/use-brush-ring.js';
import type { ScenePalette } from '../../palette/colours.js';

import { LIFT_M } from './editor-view.js';

const RING_SEGMENTS = 64;
const FULL_TURN = Math.PI + Math.PI;

export interface BrushRingProps {
  readonly centre: PlanePoint | null;
  readonly elevationM: number;
  readonly radiusM: number;
  readonly palette: ScenePalette;
  /** Half strength while the brush aims, full while the button is held and it acts. */
  readonly phase: BrushPhase;
}

/** A 2 px ring on a light halo at the brush rim, following the cursor; it draws over the ground. */
export function BrushRing(props: BrushRingProps): ReactElement | null {
  const lines = useRef<(FadedLine | null)[]>([null, null]);
  useBrushRingFrames(props, lines);
  const { centre, elevationM, radiusM, palette } = props;
  if (centre === null) return null;
  const points = Array.from({ length: RING_SEGMENTS + 1 }, (_, index) => {
    const angle = (index / RING_SEGMENTS) * FULL_TURN;
    return [
      centre.x + Math.cos(angle) * radiusM,
      elevationM + LIFT_M,
      centre.y + Math.sin(angle) * radiusM,
    ] as [number, number, number];
  });
  return (
    <>
      <Line
        ref={(line) => {
          lines.current[0] = line;
        }}
        transparent
        points={points}
        color={palette.sky}
        lineWidth={BRUSH_HALO_PX}
        depthTest={false}
        renderOrder={3}
      />
      <Line
        ref={(line) => {
          lines.current[1] = line;
        }}
        transparent
        points={points}
        color={palette.info}
        lineWidth={BRUSH_RING_PX}
        depthTest={false}
        renderOrder={4}
      />
    </>
  );
}
