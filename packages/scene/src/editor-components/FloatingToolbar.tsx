import { useRef } from 'react';
import type { ReactElement } from 'react';
import { useStore } from 'zustand';

import type { EditorStore } from '../editor/store/editor-store.js';
import { selectionToolbarShown } from '../editor/store/selectors.js';

import type { EditorStrings } from './strings.js';
import { badgeStyle, buttonStyle, floatingStyle, reasonStyle } from './styles.js';

export interface FloatingToolbarProps {
  readonly strings: EditorStrings;
  /** Horizontal drag on the rotate handle in px; 0 for a click or a key press. */
  readonly onRotateDrag: (dragPx: number) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

/** Sits above the selection with rotate, duplicate and delete. */
export function FloatingToolbar(props: FloatingToolbarProps): ReactElement {
  const { strings } = props;
  const start = useRef<number | null>(null);
  return (
    <div role="toolbar" aria-label={strings.toolbar.label} style={floatingStyle}>
      <button
        type="button"
        style={{ ...buttonStyle, cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={(event) => {
          start.current = event.clientX;
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (from !== null) props.onRotateDrag(event.clientX - from);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onRotateDrag(0);
          }
        }}
      >
        {strings.toolbar.rotate}
      </button>
      <button type="button" style={buttonStyle} onClick={props.onDuplicate}>
        {strings.toolbar.duplicate}
      </button>
      <button type="button" style={buttonStyle} onClick={props.onDelete}>
        {strings.toolbar.delete}
      </button>
    </div>
  );
}

export interface SelectionFloatingToolbarProps extends FloatingToolbarProps {
  readonly store: EditorStore;
}

/**
 * The floating toolbar for the current selection. It reads the store itself because the canvas
 * that places it re-renders a task or more after a store change; this DOM root updates at once.
 */
export function SelectionFloatingToolbar(
  props: SelectionFloatingToolbarProps,
): ReactElement | null {
  const { store, ...toolbar } = props;
  const shown = useStore(store, selectionToolbarShown);
  return shown ? <FloatingToolbar {...toolbar} /> : null;
}

export function LockBadge({ label }: { readonly label: string }): ReactElement {
  return <span style={{ ...badgeStyle, pointerEvents: 'none' }}>{label}</span>;
}

/** The one-line reason beside a red ghost. */
export function GhostReason({ text }: { readonly text: string }): ReactElement {
  return <span style={reasonStyle}>{text}</span>;
}
