import { Line } from '@react-three/drei';
import { createPortal, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Scene } from 'three';

import type { EditorView } from './editor-view.js';
import { GhostMaterial } from './PlacingOverlay.js';

// One constant array, so drei's Line keeps its geometry and material across renders. A new
// points array would make it dispose the material, which frees the program again.
const KEEPER_LINE: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
];

export interface ProgramKeeperProps {
  readonly view: EditorView;
  readonly onReady: () => void;
}

/**
 * three frees a shader program when the last material that uses it is disposed. The placing
 * ghost, its outline and the selection outline unmount on every tool change, so each placement
 * recompiled their shaders on the main thread (about 300 ms on software GL), which held up the
 * meters. This keeps one copy of each of those materials in a scene that is never drawn and
 * compiles it once at startup, so later overlays reuse the programs.
 */
export function ProgramKeeper({ view, onReady }: ProgramKeeperProps): ReactElement {
  const keeperScene = useMemo(() => new Scene(), []);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    let mounted: 'mounted' | 'gone' = 'mounted';
    const settle = () => {
      if (mounted === 'mounted') onReady();
    };
    // A failed warm-up only costs the old first-use compile, so the editor still reports ready.
    gl.compileAsync(keeperScene, camera, scene).then(settle, settle);
    return () => {
      mounted = 'gone';
    };
  }, [gl, camera, scene, keeperScene, onReady]);
  return createPortal(
    <>
      <Line points={KEEPER_LINE} color={view.palette.info} />
      <Line points={KEEPER_LINE} color={view.palette.info} dashed />
      <mesh>
        <boxGeometry />
        <GhostMaterial colour={view.palette.success} />
      </mesh>
    </>,
    keeperScene,
  );
}
