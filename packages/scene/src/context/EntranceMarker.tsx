import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import type { EditorView } from '../editor-components/canvas/editor-view.js';
import { GhostMarker } from '../editor-components/canvas/GhostMarker.js';

import { apronElevation } from './apron.js';

// A sidewalk point is a spot, so the ring takes its smallest on-screen size.
const SPOT = { widthM: 0.5, depthM: 0.5 } as const;

/** A small ring on the sidewalk point the entrance being placed snapped toward. */
export function EntranceMarker({ view }: { readonly view: EditorView }): ReactElement | null {
  const marker = useStore(view.ctx.store, (state) => state.entranceMarker);
  const ground = useMemo(() => apronElevation(view.ctx.baseHeightmap), [view.ctx.baseHeightmap]);
  if (marker === null) return null;
  const at = [marker.x, ground({ x: marker.x, z: marker.y }), marker.y] as const;
  return (
    <GhostMarker
      at={at}
      footprint={SPOT}
      colour={view.palette.contextAccent}
      halo={view.palette.sky}
    />
  );
}
