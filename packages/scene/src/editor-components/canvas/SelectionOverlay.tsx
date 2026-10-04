import { Html } from '@react-three/drei';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Vector3 } from 'three';
import { useStore } from 'zustand';

import type { DesignDocument, PlanePoint } from '@parkshape/core';

import {
  deleteSelection,
  duplicateSelection,
  previewDocument,
  rotateSelectionByDrag,
} from '../../editor/actions/selecting.js';
import { rectangleFromDrag } from '../../editor/area-tool.js';
import { selectionRingRadiusM, SELECTION_OUTLINE_PX } from '../../editor/overlay-style.js';
import { footprintCorners, selectionAnchor, toolbarAnchor } from '../../editor/overlays.js';
import type { ElementRef } from '../../editor/types.js';
import { LockBadge, SelectionFloatingToolbar } from '../FloatingToolbar.js';

import { LAYERS, PASS_THROUGH, type EditorView } from './editor-view.js';
import { GroundLine } from './GroundLine.js';
import { TOOLBAR_BOX_STYLE } from './toolbar-box.js';
import { useToolbarPlace } from './use-toolbar-place.js';

// The toolbar floats this far above the ground at the middle of the selection.
const TOOLBAR_GAP_M = 2;
const BADGE_LIFT_M = 3;
const RING_POINTS = 32;
const FULL_TURN = Math.PI + Math.PI;

function ringAround(centre: PlanePoint, radiusM: number): PlanePoint[] {
  return Array.from({ length: RING_POINTS }, (_, index) => {
    const angle = (index / RING_POINTS) * FULL_TURN;
    return { x: centre.x + Math.cos(angle) * radiusM, y: centre.y + Math.sin(angle) * radiusM };
  });
}

function SelectedOutlines({ view }: { readonly view: EditorView }): ReactElement {
  const { ctx, palette } = view;
  const state = useStore(ctx.store, (current) => current);
  const document = useMemo(() => previewDocument(state), [state]);
  const ids = new Set(state.selection.map((ref) => ref.id));
  const items = document.items.filter((item) => ids.has(item.id));
  const areas = document.areas.filter((area) => ids.has(area.id));
  const paths = document.paths.filter((path) => ids.has(path.id));
  return (
    <>
      {items.map((item) => {
        const entry = ctx.catalog.get(item.catalogId);
        const size = entry?.geometryKind === 'point' ? entry.footprint : { widthM: 1, depthM: 1 };
        return (
          <group key={item.id}>
            <GroundLine
              view={view}
              colour={palette.focus}
              width={SELECTION_OUTLINE_PX}
              closed="closed"
              points={footprintCorners(item.position, size, item.rotationDeg)}
            />
            <GroundLine
              view={view}
              colour={palette.focus}
              width={SELECTION_OUTLINE_PX}
              closed="closed"
              points={ringAround(item.position, selectionRingRadiusM(size))}
            />
          </group>
        );
      })}
      {areas.map((area) => (
        <GroundLine
          key={area.id}
          view={view}
          colour={palette.focus}
          width={SELECTION_OUTLINE_PX}
          closed="closed"
          points={area.polygon}
        />
      ))}
      {paths.map((path) => (
        <GroundLine
          key={path.id}
          view={view}
          colour={palette.focus}
          width={SELECTION_OUTLINE_PX}
          points={path.points}
        />
      ))}
    </>
  );
}

/** Height of the tallest selected element, from the catalog. */
function tallestSelected(
  view: EditorView,
  document: DesignDocument,
  selection: readonly ElementRef[],
) {
  const ids = new Set(selection.map((ref) => ref.id));
  const catalogIds = [...document.items, ...document.areas]
    .filter((element) => ids.has(element.id))
    .map((element) => element.catalogId);
  return Math.max(0, ...catalogIds.map((id) => view.ctx.catalog.get(id)?.heightM ?? 0));
}

function SelectionToolbar({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, strings } = view;
  const document = useStore(ctx.store, (state) => state.document);
  const selection = useStore(ctx.store, (state) => state.selection);
  const drag = useStore(ctx.store, (state) => state.drag);
  const tool = useStore(ctx.store, (state) => state.tool);
  const anchor = useMemo(
    () => toolbarAnchor(document, selection, tool),
    [document, selection, tool],
  );
  const ground = useMemo(
    () =>
      new Vector3(anchor?.x ?? 0, anchor === null ? 0 : ctx.elevationAt(anchor), anchor?.y ?? 0),
    [anchor, ctx],
  );
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const calculatePosition = useToolbarPlace(box, ground);
  if (anchor === null || drag !== null) return null;
  const height = ground.y + tallestSelected(view, document, selection) + TOOLBAR_GAP_M;
  return (
    <Html
      position={[anchor.x, height, anchor.y]}
      calculatePosition={calculatePosition}
      zIndexRange={[LAYERS.toolbar, LAYERS.floor]}
      pointerEvents="none"
      style={PASS_THROUGH}
    >
      <div ref={setBox} data-floating-toolbar="" style={TOOLBAR_BOX_STYLE}>
        <SelectionFloatingToolbar
          store={ctx.store}
          strings={strings}
          onRotateDrag={(dragPx) => {
            rotateSelectionByDrag(ctx, dragPx);
          }}
          onDuplicate={() => {
            duplicateSelection(ctx);
          }}
          onDelete={() => {
            deleteSelection(ctx);
          }}
        />
      </div>
    </Html>
  );
}

function LockedBadge({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, strings } = view;
  const notice = useStore(ctx.store, (state) => state.notice);
  const document = useStore(ctx.store, (state) => state.document);
  if (notice?.kind !== 'locked') return null;
  const anchor =
    selectionAnchor(document, [{ kind: 'item', id: notice.id }]) ??
    selectionAnchor(document, [{ kind: 'area', id: notice.id }]);
  if (anchor === null) return null;
  return (
    <Html
      position={[anchor.x, ctx.elevationAt(anchor) + BADGE_LIFT_M, anchor.y]}
      center
      zIndexRange={[LAYERS.toolbar, LAYERS.floor]}
      pointerEvents="none"
      style={PASS_THROUGH}
    >
      <LockBadge label={strings.toolbar.locked} />
    </Html>
  );
}

export interface MarqueeBoxProps {
  readonly view: EditorView;
  readonly marquee: { readonly from: PlanePoint; readonly to: PlanePoint } | null;
}

export function MarqueeBox({ view, marquee }: MarqueeBoxProps): ReactElement | null {
  if (marquee === null) return null;
  return (
    <GroundLine
      view={view}
      colour={view.palette.info}
      closed="closed"
      dashed="dashed"
      points={rectangleFromDrag(marquee.from, marquee.to)}
    />
  );
}

/** A light outline on the item under the pointer, so it reads as selectable before a click. */
function HoverOutline({ view }: { readonly view: EditorView }): ReactElement | null {
  const { ctx, palette } = view;
  const hovered = useStore(ctx.store, (state) => state.hovered);
  const drag = useStore(ctx.store, (state) => state.drag);
  const document = useStore(ctx.store, (state) => state.document);
  const selection = useStore(ctx.store, (state) => state.selection);
  if (hovered === null || drag !== null) return null;
  if (selection.some((ref) => ref.id === hovered)) return null;
  const item = document.items.find((entry) => entry.id === hovered);
  if (item === undefined) return null;
  const entry = ctx.catalog.get(item.catalogId);
  const size = entry?.geometryKind === 'point' ? entry.footprint : { widthM: 1, depthM: 1 };
  return (
    <GroundLine
      view={view}
      colour={palette.info}
      width={SELECTION_OUTLINE_PX}
      closed="closed"
      points={footprintCorners(item.position, size, item.rotationDeg)}
    />
  );
}

/** Outlines around the selection, the floating toolbar above it and the lock badge. */
export function SelectionOverlay({ view }: { readonly view: EditorView }): ReactElement {
  return (
    <>
      <HoverOutline view={view} />
      <SelectedOutlines view={view} />
      <SelectionToolbar view={view} />
      <LockedBadge view={view} />
    </>
  );
}
