import type { DesignArea, DesignItem, DesignPath } from '@parkshape/core';

import { commandStack } from '../command-stack.js';
import { toolbarAnchor } from '../overlays.js';
import { snapModeOf, type SnapMode } from '../snap.js';
import type { ElementKind } from '../types.js';

import type { EditorState } from './types.js';

export const canUndo = (state: EditorState) => commandStack.canUndo(state.history);
export const canRedo = (state: EditorState) => commandStack.canRedo(state.history);
export const snapMode = (state: EditorState): SnapMode =>
  snapModeOf({ toggle: state.snap, alt: state.alt });

const selectedIds = (state: EditorState, kind: ElementKind) =>
  new Set(state.selection.filter((ref) => ref.kind === kind).map((ref) => ref.id));

export function selectedItems(state: EditorState): DesignItem[] {
  const ids = selectedIds(state, 'item');
  return state.document.items.filter((item) => ids.has(item.id));
}

export function selectedPaths(state: EditorState): DesignPath[] {
  const ids = selectedIds(state, 'path');
  return state.document.paths.filter((path) => ids.has(path.id));
}

export function selectedAreas(state: EditorState): DesignArea[] {
  const ids = selectedIds(state, 'area');
  return state.document.areas.filter((area) => ids.has(area.id));
}

export const isSelected = (state: EditorState, id: string) =>
  state.selection.some((ref) => ref.id === id);

/**
 * The floating toolbar shows over a selection only with the Select tool and no drag. Read from
 * the store in the same update that changes the tool, so no frame draws it over a drawing click.
 */
export const selectionToolbarShown = (state: EditorState): boolean =>
  state.drag === null && toolbarAnchor(state.document, state.selection, state.tool) !== null;
