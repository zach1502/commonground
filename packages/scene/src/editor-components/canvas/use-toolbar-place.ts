import { useThree } from '@react-three/fiber';
import { useCallback, useEffect } from 'react';
import { Vector3 } from 'three';
import type { Camera, Object3D } from 'three';

import { placeToolbarBox } from './toolbar-box.js';

const HALF = 0.5;

const projected = new Vector3();

function toCanvas(point: Vector3, camera: Camera, size: { width: number; height: number }) {
  projected.copy(point).project(camera);
  return {
    x: (projected.x + 1) * size.width * HALF,
    y: (1 - projected.y) * size.height * HALF,
  };
}

/**
 * drei's position callback for the toolbar: its top-left corner, kept inside the canvas. A
 * resize of the toolbar asks for a frame, so the first measured size lands at once.
 */
export function useToolbarPlace(element: HTMLDivElement | null, ground: Vector3) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      invalidate();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element, invalidate]);
  return useCallback(
    (anchor: Object3D, camera: Camera, size: { width: number; height: number }) =>
      placeToolbarBox(element, {
        anchor: toCanvas(new Vector3().setFromMatrixPosition(anchor.matrixWorld), camera, size),
        ground: toCanvas(ground, camera, size),
        canvas: size,
      }),
    [element, ground],
  );
}
