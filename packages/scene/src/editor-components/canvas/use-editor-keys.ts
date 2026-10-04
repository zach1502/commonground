import { useEffect } from 'react';

import type { PlanePoint } from '@parkshape/core';

import type { EditorContext } from '../../editor/actions/context.js';
import { runAction } from '../../editor/actions/keys.js';
import { nudgeSelection } from '../../editor/actions/selecting.js';
import { actionForKey, shouldIgnoreKey } from '../../editor/keyboard.js';
import { SNAP_STEP_M } from '../../editor/snap.js';

const CAMERA_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** Holding Shift moves the selection by this many grid steps at once. */
const SHIFT_MULTIPLIER = 5;

const ARROW_UNITS: Readonly<Record<string, PlanePoint>> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

function targetOf(event: KeyboardEvent): { readonly tagName: string } | null {
  return event.target instanceof Element ? event.target : null;
}

/** The nudge for an arrow key, one grid step or a larger Shift step, or null for other keys. */
function nudgeStepFor(event: KeyboardEvent): PlanePoint | null {
  const unit = ARROW_UNITS[event.key];
  if (unit === undefined) return null;
  const step = SNAP_STEP_M * (event.shiftKey ? SHIFT_MULTIPLIER : 1);
  return { x: unit.x * step, y: unit.y * step };
}

/**
 * Arrow keys move a selected element by the grid step. With nothing selected they fall through to
 * the camera, so the same keys orbit the view. This runs in the capture phase and stops the event
 * when it nudges, so the camera does not also move.
 */
function useArrowNudge(ctx: EditorContext, mode: 'overview' | 'walk'): void {
  useEffect(() => {
    if (mode === 'walk') return undefined;
    const onArrow = (event: KeyboardEvent) => {
      const step = nudgeStepFor(event);
      if (step === null || shouldIgnoreKey(targetOf(event), event.key)) return;
      if (ctx.store.getState().selection.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      nudgeSelection(ctx, step);
    };
    window.addEventListener('keydown', onArrow, true);
    return () => {
      window.removeEventListener('keydown', onArrow, true);
    };
  }, [ctx, mode]);
}

/** Editor shortcuts on the whole page, except while typing in a field or walking the park. */
export function useEditorKeys(ctx: EditorContext, mode: 'overview' | 'walk' = 'overview'): void {
  useArrowNudge(ctx, mode);
  useEffect(() => {
    if (mode === 'walk') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') ctx.store.getState().setAlt('held');
      if (shouldIgnoreKey(targetOf(event), event.key)) return;
      if (CAMERA_KEYS.has(event.key)) ctx.store.getState().hintEvent('camera-moved');
      const action = actionForKey(event);
      if (action === null) return;
      event.preventDefault();
      runAction(ctx, action);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') ctx.store.getState().setAlt('released');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [ctx, mode]);
}
