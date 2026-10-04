import type { EditorAction } from '../keyboard.js';

import type { EditorContext } from './context.js';
import { finishPathDraft, removePathPoint } from './paths.js';
import { cancelTool, startPlacing } from './placing.js';
import { deleteSelection, duplicateSelection, rotateSelection } from './selecting.js';

/** Default entries for the tool keys; the palette picks others. */
export const DEFAULT_PATH_ENTRY = 'path-gravel';
export const DEFAULT_AREA_ENTRY = 'community-garden';

function drawingPath(ctx: EditorContext): boolean {
  const { tool } = ctx.store.getState();
  return tool.kind === 'path' && tool.draft.length > 0;
}

function toggle<T extends string>(value: T, a: T, b: T): T {
  return value === a ? b : a;
}

const HANDLERS: Readonly<Record<EditorAction, (ctx: EditorContext) => void>> = {
  delete: deleteSelection,
  undo: (ctx) => {
    ctx.store.getState().undo();
  },
  redo: (ctx) => {
    ctx.store.getState().redo();
  },
  duplicate: duplicateSelection,
  rotateIncrease: (ctx) => {
    rotateSelection(ctx, 'increase');
  },
  rotateDecrease: (ctx) => {
    rotateSelection(ctx, 'decrease');
  },
  shortcuts: (ctx) => {
    const state = ctx.store.getState();
    state.setShortcuts(toggle(state.shortcuts, 'open', 'closed'));
  },
  cancel: cancelTool,
  finish: (ctx) => {
    if (ctx.store.getState().tool.kind === 'path') finishPathDraft(ctx);
  },
  backspace: (ctx) => {
    if (drawingPath(ctx)) removePathPoint(ctx);
    else deleteSelection(ctx);
  },
  toolSelect: (ctx) => {
    ctx.store.getState().setTool({ kind: 'select' });
  },
  toolPath: (ctx) => {
    startPlacing(ctx, DEFAULT_PATH_ENTRY);
  },
  toolArea: (ctx) => {
    startPlacing(ctx, DEFAULT_AREA_ENTRY);
  },
  toggleSnap: (ctx) => {
    const state = ctx.store.getState();
    state.setSnap(toggle(state.snap, 'on', 'off'));
  },
  itemsList: (ctx) => {
    const state = ctx.store.getState();
    state.setItemsList(toggle(state.itemsList, 'hidden', 'shown'));
  },
};

export function runAction(ctx: EditorContext, action: EditorAction): void {
  HANDLERS[action](ctx);
}
