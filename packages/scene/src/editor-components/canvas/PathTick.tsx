import { Line } from '@react-three/drei';
import { useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import type { Group, MeshBasicMaterial } from 'three';

import type { PathTick as Tick, PathTickLook } from '../../motion/path-tick.js';
import { usePathTickFrames } from '../../motion/use-path-tick.js';

import { LIFT_M, type EditorView } from './editor-view.js';
import { HANDLE_RADIUS_M, HANDLE_SEGMENTS } from './handle-size.js';

const TICK_LINE_PX = 3;

export interface PathTickProps {
  readonly view: EditorView;
  readonly tick: Tick;
  readonly onDone: () => void;
}

/**
 * J20: the segment the new point made grows from the previous point, scaled uniformly, and the
 * new vertex fades in. Both run 150 ms; the draft draws the point solid once the tick ends.
 */
export function PathTick({ view, tick, onDone }: PathTickProps): ReactElement {
  const segment = useRef<Group>(null);
  const vertex = useRef<MeshBasicMaterial>(null);
  const apply = useCallback((look: PathTickLook) => {
    segment.current?.scale.setScalar(Math.max(look.scale, Number.EPSILON));
    if (vertex.current !== null) vertex.current.opacity = look.opacity;
  }, []);
  usePathTickFrames(apply, onDone);
  const { elevationAt } = view.ctx;
  const to = [tick.to.x, elevationAt(tick.to) + LIFT_M, tick.to.y] as const;
  const from = tick.from;
  return (
    <>
      {from === null ? null : (
        <group
          ref={segment}
          position={[from.x, elevationAt(from) + LIFT_M, from.y]}
          scale={Number.EPSILON}
        >
          <Line
            points={[
              [0, 0, 0],
              [to[0] - from.x, to[1] - (elevationAt(from) + LIFT_M), to[2] - from.y],
            ]}
            color={view.palette.info}
            lineWidth={TICK_LINE_PX}
            depthTest={false}
            renderOrder={2}
          />
        </group>
      )}
      <mesh position={[...to]}>
        <sphereGeometry args={[HANDLE_RADIUS_M, HANDLE_SEGMENTS, HANDLE_SEGMENTS]} />
        <meshBasicMaterial
          ref={vertex}
          color={view.palette.info}
          depthTest={false}
          transparent
          opacity={0}
        />
      </mesh>
    </>
  );
}
