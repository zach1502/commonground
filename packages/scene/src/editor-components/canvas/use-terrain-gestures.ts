import type { GroupProps, ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';

import type { EditorContext } from '../../editor/actions/context.js';
import {
  clickAt,
  contextMenuAt,
  doubleClickAt,
  handleDown,
  NO_GESTURE,
  pointerDown,
  pointerMove,
  pointerUp,
  type Gesture,
  type PointerInput,
} from '../../editor/actions/gestures.js';
import { itemUnderRay } from '../../editor/ray-pick.js';

import type { EditorView } from './editor-view.js';
import type { HandleDown } from './PathOverlay.js';

/** A press that moves less than this is a click, not a drag. */
const CLICK_SLOP_PX = 4;
const PRIMARY_BUTTON = 0;
// Gestures that already acted on release, so the click that follows is not a second action.
const CONSUMING = new Set<Gesture['kind']>(['marquee', 'area', 'vertex', 'corner', 'blocked']);

export interface ControlsHandle {
  enabled: boolean;
}

type PointerLike = ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>;

/**
 * The item model the pointer ray passed through before it reached the ground. Only the select
 * tool picks items; the other tools act on the ground point.
 */
function aimedItem(ctx: EditorContext, event: PointerLike): string | undefined {
  const state = ctx.store.getState();
  if (state.tool.kind !== 'select') return undefined;
  const aimed = itemUnderRay({
    ray: event.ray,
    document: state.document,
    catalog: ctx.catalog,
    elevationAt: ctx.elevationAt,
    beforeM: event.distance,
  });
  return aimed ?? undefined;
}

function inputOf(ctx: EditorContext, event: PointerLike): PointerInput {
  return {
    point: { x: event.point.x, y: event.point.z },
    shift: event.nativeEvent.shiftKey ? 'held' : 'released',
    aimed: aimedItem(ctx, event),
  };
}

interface GestureDeps {
  readonly view: EditorView;
  readonly controls: { current: ControlsHandle | null };
  readonly gesture: { current: Gesture };
  readonly last: { current: PointerInput | null };
  readonly suppressClick: { current: boolean };
  readonly show: (gesture: Gesture) => void;
}

function begin(deps: GestureDeps, gesture: Gesture): void {
  deps.gesture.current = gesture;
  deps.show(gesture);
  if (gesture.kind === 'none') return;
  if (deps.controls.current !== null) deps.controls.current.enabled = false;
  window.addEventListener(
    'pointerup',
    () => {
      const current = deps.gesture.current;
      if (deps.last.current !== null) pointerUp(deps.view.ctx, current, deps.last.current);
      deps.suppressClick.current = CONSUMING.has(current.kind);
      deps.gesture.current = NO_GESTURE;
      deps.show(NO_GESTURE);
      if (deps.controls.current !== null) deps.controls.current.enabled = true;
    },
    { once: true },
  );
}

function createHandlers(deps: GestureDeps): { events: GroupProps; onHandleDown: HandleDown } {
  const { ctx } = deps.view;
  const events: GroupProps = {
    onPointerDown: (event) => {
      if (event.button !== PRIMARY_BUTTON) return;
      deps.last.current = inputOf(ctx, event);
      begin(deps, pointerDown(ctx, deps.last.current));
    },
    onPointerMove: (event) => {
      ctx.store.getState().setAlt(event.nativeEvent.altKey ? 'held' : 'released');
      deps.last.current = inputOf(ctx, event);
      const next = pointerMove(ctx, deps.gesture.current, deps.last.current);
      if (next !== deps.gesture.current) {
        deps.gesture.current = next;
        deps.show(next);
      }
    },
    onPointerLeave: () => {
      ctx.store.getState().setGhost(null);
      ctx.store.getState().setHovered(null);
    },
    onClick: (event) => {
      const suppressed = deps.suppressClick.current;
      deps.suppressClick.current = false;
      if (!suppressed && event.delta <= CLICK_SLOP_PX) clickAt(ctx, inputOf(ctx, event));
    },
    onDoubleClick: () => {
      doubleClickAt(ctx);
    },
    onContextMenu: (event) => {
      event.nativeEvent.preventDefault();
      if (event.delta <= CLICK_SLOP_PX) contextMenuAt(ctx);
    },
  };
  const onHandleDown: HandleDown = (handle, event) => {
    event.stopPropagation();
    deps.last.current = inputOf(ctx, event);
    begin(deps, handleDown(ctx, handle));
  };
  return { events, onHandleDown };
}

/** Turns ground pointer events into editor gestures; the rules live in editor/actions. */
export function useTerrainGestures(view: EditorView, controls: { current: ControlsHandle | null }) {
  const [shown, show] = useState<Gesture>(NO_GESTURE);
  const gesture = useRef<Gesture>(NO_GESTURE);
  const last = useRef<PointerInput | null>(null);
  const suppressClick = useRef(false);
  const handlers = useMemo(
    () => createHandlers({ view, controls, gesture, last, suppressClick, show }),
    [view, controls],
  );
  return { ...handlers, gesture: shown };
}
