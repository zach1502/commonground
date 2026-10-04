import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import { ghostColour, GHOST_OPACITY, REASON_OFFSET_PX } from '../../editor/overlay-style.js';
import { footprintCorners, lockedOutlines } from '../../editor/overlays.js';
import { GhostReason } from '../FloatingToolbar.js';
import { reasonText } from '../reason-text.js';

import { LAYERS, PASS_THROUGH, type EditorView } from './editor-view.js';
import { GhostMarker } from './GhostMarker.js';
import { GroundLine } from './GroundLine.js';

const GUIDE_REACH_M = 40;
const HALF = 0.5;
// Offsets the label from the cursor point it is anchored to.
const reasonStyle = {
  ...PASS_THROUGH,
  transform: `translate(${String(REASON_OFFSET_PX)}px, ${String(REASON_OFFSET_PX)}px)`,
} as const;

/**
 * The ghost's see-through look. The program keeper compiles this same material, so the ghost's
 * shader stays compiled while no ghost is on screen.
 */
export function GhostMaterial({ colour }: { readonly colour: string }): ReactElement {
  return (
    <meshBasicMaterial color={colour} transparent opacity={GHOST_OPACITY} depthWrite={false} />
  );
}

function GhostBody({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, palette, strings } = view;
  const ghost = useStore(ctx.store, (state) => state.ghost);
  const tool = useStore(ctx.store, (state) => state.tool);
  if (ghost === null || tool.kind !== 'place') return null;
  const entry = ctx.catalog.get(tool.catalogId);
  if (entry?.geometryKind !== 'point') return null;
  const { widthM, depthM } = entry.footprint;
  const ground = ctx.elevationAt(ghost.position);
  const colour = ghostColour(ghost.validity, palette);
  const reason = reasonText(ghost.validity, strings);
  const { x, y } = ghost.position;
  return (
    <group>
      <mesh position={[x, ground + entry.heightM * HALF, y]} renderOrder={2}>
        <boxGeometry args={[widthM, entry.heightM, depthM]} />
        <GhostMaterial colour={colour} />
      </mesh>
      <GroundLine
        view={view}
        points={footprintCorners(ghost.position, entry.footprint, 0)}
        colour={colour}
        closed="closed"
      />
      <GhostMarker
        at={[x, ground, y]}
        footprint={entry.footprint}
        colour={colour}
        halo={palette.sky}
      />
      {reason === null ? null : (
        <Html
          position={[x, ground, y]}
          zIndexRange={[LAYERS.label, LAYERS.floor]}
          pointerEvents="none"
          style={reasonStyle}
        >
          <GhostReason text={reason} />
        </Html>
      )}
    </group>
  );
}

function BlockedFootprints({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, palette } = view;
  const tool = useStore(ctx.store, (state) => state.tool);
  const document = useStore(ctx.store, (state) => state.document);
  const outlines = useMemo(() => lockedOutlines(document, ctx.catalog), [document, ctx.catalog]);
  if (tool.kind !== 'place') return null;
  return (
    <>
      {outlines.map((outline) => (
        <GroundLine
          key={outline.id}
          view={view}
          points={outline.polygon}
          colour={palette.danger}
          closed="closed"
          dashed="dashed"
        />
      ))}
    </>
  );
}

function Guides({ view }: { readonly view: EditorView }): ReactElement {
  const guides = useStore(view.ctx.store, (state) => state.guides);
  const ghost = useStore(view.ctx.store, (state) => state.ghost);
  const at = ghost?.position;
  return (
    <>
      {at === undefined
        ? null
        : guides.map((guide) => (
            <GroundLine
              key={guide.axis}
              view={view}
              colour={view.palette.info}
              dashed="dashed"
              points={
                guide.axis === 'x'
                  ? [
                      { x: guide.value, y: at.y - GUIDE_REACH_M },
                      { x: guide.value, y: at.y + GUIDE_REACH_M },
                    ]
                  : [
                      { x: at.x - GUIDE_REACH_M, y: guide.value },
                      { x: at.x + GUIDE_REACH_M, y: guide.value },
                    ]
              }
            />
          ))}
    </>
  );
}

/** The ghost that follows the cursor, the blocked footprints and the alignment guides. */
export function PlacingOverlay({ view }: { readonly view: EditorView }): ReactElement {
  return (
    <>
      <BlockedFootprints view={view} />
      <GhostBody view={view} />
      <Guides view={view} />
    </>
  );
}
