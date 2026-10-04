import { createStore, type StoreApi } from 'zustand/vanilla';

import type { DesignDocument } from '@parkshape/core';

import { commandStack, type CommandStack } from '../command-stack.js';
import type { HintsState } from '../hints.js';

import { documentSlice, historySlice, selectionSlice, toolSlice, uiSlice } from './slices.js';
import type { EditorState } from './types.js';

export type EditorStore = StoreApi<EditorState>;

export interface EditorStoreInput {
  readonly document: DesignDocument;
  readonly history?: CommandStack;
  readonly hints?: HintsState;
}

/** One store per open design. It holds state and plain setters; rules live in ../actions. */
export function createEditorStore(input: EditorStoreInput): EditorStore {
  return createStore<EditorState>()((...args) => ({
    ...documentSlice(input.document)(...args),
    ...historySlice(input.history ?? commandStack.empty())(...args),
    ...selectionSlice(...args),
    ...toolSlice(...args),
    ...uiSlice(input.hints)(...args),
  }));
}
