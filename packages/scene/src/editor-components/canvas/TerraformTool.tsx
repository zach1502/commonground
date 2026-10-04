import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Mesh } from 'three';
import { useStore } from 'zustand';

import type { OrientedRect, PlanePoint } from '@parkshape/core';

import type { TerraformSettings } from '../../editor/store/types.js';
import {
  applyStep,
  beginTerraform,
  type TerraformSession,
} from '../../editor/terraform/session.js';
import { heightmapBounds } from '../../geometry/sample.js';
import { HALF, QUARTER_TURN } from '../../geometry/vector-layout.js';
import type { BrushPhase } from '../../motion/level-tween.js';

import { BlockedZonesOverlay } from './BlockedZonesOverlay.js';
import { BrushRing } from './BrushRing.js';
import type { EditorView } from './editor-view.js';
import type { ControlsHandle } from './use-terrain-gestures.js';

const PRIMARY_BUTTON = 0;
/** A press that moves less than this many pixels counts as a click, not a hold. */
const CLICK_SLOP_PX = 4;
const APPLY_KEYS = new Set(['Enter', ' ']);

function footprintOf(view: EditorView, ids: readonly string[]): OrientedRect | null {
  const { ctx } = view;
  if (ids.length !== 1) return null;
  const item = ctx.store.getState().document.items.find((entry) => entry.id === ids[0]);
  if (item === undefined) return null;
  const entry = ctx.catalog.get(item.catalogId);
  if (entry?.geometryKind !== 'point') return null;
  const { widthM, depthM } = entry.footprint;
  return { centre: item.position, widthM, depthM, rotationDeg: item.rotationDeg };
}

interface PressHandlers {
  readonly phase: BrushPhase;
  readonly onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  readonly onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  readonly onClick: (event: ThreeEvent<MouseEvent>) => void;
  /** The ring goes when the pointer leaves the ground, unless a press is still stroking. */
  readonly onPointerLeave: () => void;
}

interface BrushHandlers extends PressHandlers {
  readonly cursor: PlanePoint | null;
  /** The last point the brush aimed at, kept after the pointer leaves, for Enter and Space. */
  readonly aim: PlanePoint | null;
  /** Applies one brush step at a point, for a single click or an Enter press. */
  readonly applyOnce: (centre: PlanePoint) => void;
}

/** A callback that reads the footprint under the current single selected item, if any. */
function useFootprint(view: EditorView): () => OrientedRect | null {
  const selection = useStore(view.ctx.store, (state) => state.selection);
  return useCallback(() => {
    const ids = selection.filter((ref) => ref.kind === 'item').map((ref) => ref.id);
    return footprintOf(view, ids);
  }, [selection, view]);
}

interface PressInput {
  readonly ctx: EditorView['ctx'];
  readonly settings: TerraformSettings;
  readonly footprint: () => OrientedRect | null;
  readonly controls: TerraformToolProps['controls'];
  readonly invalidate: () => void;
  readonly setCursor: (point: PlanePoint | null) => void;
  readonly applyOnce: (centre: PlanePoint) => void;
}

/** A hold strokes the brush every demand frame and commits on release; a click applies one step. */
function usePressStroke(input: PressInput): PressHandlers {
  const { ctx, settings, footprint, controls, invalidate, setCursor, applyOnce } = input;
  const session = useRef<TerraformSession | null>(null);
  const point = useRef<PlanePoint | null>(null);
  // True once a frame has stroked during this press, so the click that follows does not add a step.
  const stroked = useRef(false);
  const [phase, setPhase] = useState<BrushPhase>('aiming');
  const end = useCallback(() => {
    setPhase('aiming');
    session.current?.end();
    session.current = null;
    if (controls.current !== null) controls.current.enabled = true;
    invalidate();
  }, [controls, invalidate]);
  const onPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== PRIMARY_BUTTON) return;
      event.stopPropagation();
      stroked.current = false;
      point.current = { x: event.point.x, y: event.point.z };
      setCursor(point.current);
      setPhase('applying');
      if (controls.current !== null) controls.current.enabled = false;
      session.current = beginTerraform({ ctx, settings, footprint: footprint() });
      window.addEventListener('pointerup', end, { once: true });
    },
    [ctx, settings, footprint, controls, end, setCursor],
  );
  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      point.current = { x: event.point.x, y: event.point.z };
      setCursor(point.current);
      invalidate();
    },
    [invalidate, setCursor],
  );
  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (stroked.current) {
        stroked.current = false;
        return;
      }
      if (event.delta > CLICK_SLOP_PX) return;
      applyOnce({ x: event.point.x, y: event.point.z });
    },
    [applyOnce],
  );
  const onPointerLeave = useCallback(() => {
    if (session.current === null) setCursor(null);
  }, [setCursor]);
  useFrame((_, dt) => {
    if (session.current === null || point.current === null) return;
    session.current.stroke(point.current, dt);
    stroked.current = true;
    invalidate();
  });
  return { phase, onPointerDown, onPointerMove, onClick, onPointerLeave };
}

/**
 * The brush interaction. A hold strokes every frame and commits on release; a single click or an
 * Enter press applies one step at the pointer, so no grading needs a sustained drag.
 */
function useBrushSession(
  view: EditorView,
  controls: TerraformToolProps['controls'],
): BrushHandlers {
  const { ctx } = view;
  const settings = useStore(ctx.store, (state) => state.terraform);
  const invalidate = useThree((state) => state.invalidate);
  const [cursor, showCursor] = useState<PlanePoint | null>(null);
  const [aim, setAim] = useState<PlanePoint | null>(null);
  const setCursor = useCallback((point: PlanePoint | null) => {
    showCursor(point);
    if (point !== null) setAim(point);
  }, []);
  const footprint = useFootprint(view);
  const applyOnce = useCallback(
    (centre: PlanePoint) => {
      applyStep({ ctx, settings, footprint: footprint() }, centre);
      invalidate();
    },
    [ctx, settings, footprint, invalidate],
  );
  const press = usePressStroke({
    ctx,
    settings,
    footprint,
    controls,
    invalidate,
    setCursor,
    applyOnce,
  });
  return { cursor, aim, applyOnce, ...press };
}

export interface TerraformToolProps {
  readonly view: EditorView;
  readonly controls: { current: ControlsHandle | null };
}

/**
 * Pointer hits test against the world matrix, which three only computes when it draws. With
 * frames on demand, a press right after choosing the tool could come before that first frame
 * and miss the new plane, so the matrix is computed as soon as the plane mounts.
 */
function placeHitPlane(mesh: Mesh | null): void {
  mesh?.updateWorldMatrix(true, false);
}

/** The brush interaction: a plane over the terrain, its ring and the blocked zones. */
export function TerraformTool({ view, controls }: TerraformToolProps): ReactElement | null {
  const { ctx, palette } = view;
  const tool = useStore(ctx.store, (state) => state.tool);
  const settings = useStore(ctx.store, (state) => state.terraform);
  const canvas = useThree((state) => state.gl.domElement);
  const bounds = useMemo(() => heightmapBounds(ctx.baseHeightmap), [ctx.baseHeightmap]);
  const centre = useMemo(
    () => ({ x: (bounds.minX + bounds.maxX) * HALF, y: (bounds.minZ + bounds.maxZ) * HALF }),
    [bounds],
  );
  const { cursor, aim, phase, applyOnce, ...pointer } = useBrushSession(view, controls);
  const isTerraform = tool.kind === 'terraform';
  const replayPointer = useThree((state) => state.events.update);
  // A pointer already resting on the ground when the tool is chosen, or one that moved there
  // before the hit plane mounted, gets its ring at once from the last pointer event. A pointer
  // off the canvas gets none, so no ring waits at a spot it left.
  const { onPointerLeave } = pointer;
  useEffect(() => {
    if (!isTerraform) onPointerLeave();
    else if (canvas.matches(':hover')) replayPointer?.();
  }, [isTerraform, replayPointer, canvas, onPointerLeave]);
  useEffect(() => {
    if (!isTerraform) return undefined;
    // Enter or Space applies at the brush cursor while the canvas has focus, the keyboard path.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!APPLY_KEYS.has(event.key) || document.activeElement !== canvas) return;
      event.preventDefault();
      applyOnce(aim ?? centre);
    };
    canvas.addEventListener('keydown', onKeyDown);
    return () => {
      canvas.removeEventListener('keydown', onKeyDown);
    };
  }, [isTerraform, canvas, applyOnce, aim, centre]);
  if (!isTerraform) return null;
  return (
    <group>
      <mesh
        ref={placeHitPlane}
        position={[centre.x, bounds.maxY, centre.y]}
        rotation={[-QUARTER_TURN, 0, 0]}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerLeave={pointer.onPointerLeave}
        onClick={pointer.onClick}
      >
        <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <BrushRing
        centre={cursor}
        elevationM={cursor === null ? bounds.maxY : ctx.elevationAt(cursor)}
        radiusM={settings.radiusM}
        palette={palette}
        phase={phase}
      />
      <BlockedZonesOverlay view={view} />
    </group>
  );
}
