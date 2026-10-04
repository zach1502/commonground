import { useThree } from '@react-three/fiber';
import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type { DirectionalLight } from 'three';

/** Marks the sun's shadow map for one redraw and asks for a frame, for frameloop="demand". */
export function useShadowRefresh(sunRef: RefObject<DirectionalLight>): () => void {
  const invalidate = useThree((state) => state.invalidate);
  return useCallback(() => {
    const light = sunRef.current;
    if (light === null) return;
    light.shadow.needsUpdate = true;
    invalidate();
  }, [sunRef, invalidate]);
}

export interface ShadowRefreshProps {
  readonly refresh: () => void;
  /** Inputs that move the casters; a new value redraws the map once. */
  readonly document: unknown;
  readonly terrain: unknown;
  readonly showing: unknown;
}

/**
 * Redraws the shadow map on load and after each change. It sits inside the Suspense boundary,
 * so its first effect runs once the models have loaded.
 */
export function ShadowRefresh({ refresh, document, terrain, showing }: ShadowRefreshProps): null {
  useEffect(() => {
    refresh();
  }, [refresh, document, terrain, showing]);
  return null;
}
