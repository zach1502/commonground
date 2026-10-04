import type { ZoneKind } from '@parkshape/core';

import { setLocked } from '../commands.js';
import type { EditorState, Tool } from '../store/types.js';

import type { EditorContext } from './context.js';

export type LockChoice = 'locked' | 'unlocked';

/** Which drag-a-rectangle gesture a tool uses: a catalog area, a zone, or neither. */
export function gestureAreaTool(tool: Tool): 'area' | 'zone' | 'none' {
  if (tool.kind === 'area') return 'area';
  return tool.kind === 'zone' ? 'zone' : 'none';
}

export interface LockTarget {
  readonly kind: 'item' | 'area';
  readonly id: string;
}

/** The one selected item or area, or null; what the staff lock toggle acts on. */
export function lockTargetOf(state: EditorState): LockTarget | null {
  const [ref, ...others] = state.selection;
  if (ref === undefined || others.length > 0 || ref.kind === 'path') return null;
  return { kind: ref.kind, id: ref.id };
}

/** Whether the target is locked, or null when it no longer exists. */
export function lockStateOf(state: EditorState, target: LockTarget): LockChoice | null {
  const list = target.kind === 'item' ? state.document.items : state.document.areas;
  const element = list.find((candidate) => candidate.id === target.id);
  if (element === undefined) return null;
  return element.locked ? 'locked' : 'unlocked';
}

/**
 * Staff only: locks or unlocks one item or area as one undoable step. Locked elements drop out
 * of the selection, so the caller keeps the target to offer the unlock.
 */
export function setElementLock(
  ctx: EditorContext,
  target: LockTarget,
  choice: LockChoice,
): 'changed' | 'none' {
  const state = ctx.store.getState();
  const current = lockStateOf(state, target);
  if (current === null || current === choice) return 'none';
  state.execute(setLocked(target.kind, target.id, choice));
  return 'changed';
}

export interface ZoneToolOptions {
  readonly kind: ZoneKind;
  /** The zone's name, such as "Forbidden zone 1"; comes from the app's locale strings. */
  readonly label: string;
}

/** Staff only: the next rectangle dragged on the ground becomes a forbidden or no-grade zone. */
export function startZoneTool(ctx: EditorContext, options: ZoneToolOptions): void {
  const state = ctx.store.getState();
  state.clearSelection();
  state.setTool({ kind: 'zone', zoneKind: options.kind, label: options.label, draft: null });
}
