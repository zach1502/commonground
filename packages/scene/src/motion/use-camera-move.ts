import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { placeCamera, type OrbitAim, type OrbitEvents } from './camera-fly.js';
import { cameraMoverFor } from './camera-move.js';

/** Stops a flight in progress as soon as the reader drags, scrolls or touches the canvas. */
export function useCancelCameraOnInput(controls: { readonly current: OrbitEvents | null }): void {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const current = controls.current;
    if (current === null) return undefined;
    const stop = () => {
      cameraMoverFor(camera).cancel();
    };
    current.addEventListener('start', stop);
    return () => {
      current.removeEventListener('start', stop);
    };
  }, [camera, controls]);
}

/** Steps the camera's flight on each frame, and keeps frames coming while it runs. */
export function useCameraMoveFrames(controls: { readonly current: OrbitAim | null }): void {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    const mover = cameraMoverFor(camera);
    const pose = mover.step();
    if (pose === null) return;
    placeCamera(camera, controls.current, pose);
    if (mover.state() === 'moving') invalidate();
  });
}
