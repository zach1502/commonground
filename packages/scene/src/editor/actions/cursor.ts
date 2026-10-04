import type { EditorState } from '../store/types.js';

/** The pointer shape drawn on the canvas, chosen by the active tool and the drag state. */
export type EditorCursor = 'default' | 'crosshair' | 'cell' | 'grabbing' | 'pointer';

/**
 * DESIGN.md Interaction: a tool reads through its cursor. The select tool points, and turns to a
 * pointer over a selectable item; a drawing tool crosshairs; terraform paints; a drag grabs.
 */
export function cursorForTool(state: EditorState): EditorCursor {
  if (state.drag !== null) return 'grabbing';
  switch (state.tool.kind) {
    case 'select':
      return state.hovered === null ? 'default' : 'pointer';
    case 'terraform':
      return 'cell';
    default:
      return 'crosshair';
  }
}
