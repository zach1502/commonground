import type { StateCreator } from 'zustand/vanilla';

import type { DesignDocument } from '@parkshape/core';

import type { HistoryChange } from '../../motion/placement-motion.js';
import { commandStack, type CommandStack } from '../command-stack.js';
import { advanceHints, dismissHint, HINTS_START, type HintsState } from '../hints.js';
import { selectableRefs } from '../selection.js';
import type { ElementRef } from '../types.js';

import type {
  DocumentSlice,
  EditorState,
  HistorySlice,
  SelectMode,
  SelectionSlice,
  TerraformSettings,
  ToolSlice,
  UiSlice,
} from './types.js';

type Slice<T> = StateCreator<EditorState, [], [], T>;

/** The brush starts as a gentle raise at a 5 m radius. */
const TERRAFORM_DEFAULTS: TerraformSettings = { mode: 'raise', radiusM: 5, strength: 0.5 };

const keepSelectable = (document: DesignDocument, selection: readonly ElementRef[]) =>
  selectableRefs(document, selection);

export const documentSlice =
  (document: DesignDocument): Slice<DocumentSlice> =>
  (set) => ({
    document,
    replaceDocument: (next) => {
      set((state) => ({ document: next, selection: keepSelectable(next, state.selection) }));
    },
  });

type Step = HistoryChange['step'];
type StepResult = ReturnType<typeof commandStack.undo>;

/** The spec a step ran: the new top of past after execute or redo, the new top of future after undo. */
function specOf(step: Step, result: StepResult) {
  return step === 'undo' ? result.stack.future.at(-1) : result.stack.past.at(-1);
}

export const historySlice =
  (history: CommandStack): Slice<HistorySlice> =>
  (set) => {
    const change = (step: Step, run: (state: EditorState) => StepResult) => {
      set((state) => {
        const result = run(state);
        const { stack, document } = result;
        const spec = specOf(step, result);
        const moved = stack !== state.history && spec !== undefined;
        const serial = (state.change?.serial ?? 0) + 1;
        return {
          history: stack,
          document,
          selection: keepSelectable(document, state.selection),
          change: moved ? { step, spec, serial } : state.change,
        };
      });
    };
    return {
      history,
      change: null,
      execute: (spec) => {
        change('execute', (state) => commandStack.push(state.history, spec, state.document));
      },
      undo: () => {
        change('undo', (state) => commandStack.undo(state.history, state.document));
      },
      redo: () => {
        change('redo', (state) => commandStack.redo(state.history, state.document));
      },
    };
  };

function combine(current: readonly ElementRef[], refs: readonly ElementRef[], mode: SelectMode) {
  const has = (ref: ElementRef) =>
    current.some((entry) => entry.id === ref.id && entry.kind === ref.kind);
  if (mode === 'replace') return refs;
  if (mode === 'add') return [...current, ...refs.filter((ref) => !has(ref))];
  const toggled = refs.filter((ref) => !has(ref));
  const kept = current.filter(
    (entry) => !refs.some((ref) => ref.id === entry.id && ref.kind === entry.kind),
  );
  return [...kept, ...toggled];
}

export const selectionSlice: Slice<SelectionSlice> = (set) => ({
  selection: [],
  select: (refs, mode) => {
    set((state) => ({
      selection: combine(state.selection, selectableRefs(state.document, refs), mode),
    }));
  },
  clearSelection: () => {
    set({ selection: [] });
  },
});

export const toolSlice: Slice<ToolSlice> = (set) => ({
  tool: { kind: 'select' },
  paint: 'off',
  snap: 'on',
  alt: 'released',
  ghost: null,
  hovered: null,
  guides: [],
  drag: null,
  terraform: TERRAFORM_DEFAULTS,
  entranceSnap: null,
  entranceMarker: null,
  setTool: (tool) => {
    // A path draft that gains a point keeps the marker of the entrance it just snapped.
    set((state) => ({
      tool,
      ghost: null,
      guides: [],
      drag: null,
      hovered: null,
      entranceMarker: state.tool.kind === tool.kind ? state.entranceMarker : null,
    }));
  },
  setPaint: (paint) => {
    set({ paint });
  },
  setSnap: (snap) => {
    set({ snap });
  },
  setAlt: (alt) => {
    set({ alt });
  },
  setGhost: (ghost) => {
    set({ ghost });
  },
  setHovered: (hovered) => {
    set({ hovered });
  },
  setGuides: (guides) => {
    set({ guides });
  },
  setDrag: (drag) => {
    set({ drag });
  },
  setTerraform: (terraform) => {
    set({ terraform });
  },
  setEntranceSnap: (entranceSnap) => {
    set({ entranceSnap, entranceMarker: null });
  },
  setEntranceMarker: (entranceMarker) => {
    set((state) => (state.entranceMarker === entranceMarker ? state : { entranceMarker }));
  },
});

export const uiSlice =
  (hints: HintsState = HINTS_START): Slice<UiSlice> =>
  (set) => ({
    shortcuts: 'closed',
    itemsList: 'hidden',
    notice: null,
    hints,
    setShortcuts: (shortcuts) => {
      set({ shortcuts });
    },
    setItemsList: (itemsList) => {
      set({ itemsList });
    },
    setNotice: (notice) => {
      set({ notice });
    },
    setHints: (next) => {
      set({ hints: next });
    },
    hintEvent: (event) => {
      set((state) => ({ hints: advanceHints(state.hints, event) }));
    },
    dismissHint: (id) => {
      set((state) => ({ hints: dismissHint(state.hints, id) }));
    },
  });
