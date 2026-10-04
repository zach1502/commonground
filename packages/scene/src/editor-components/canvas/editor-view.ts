import type { EditorContext } from '../../editor/actions/context.js';
import type { ScenePalette } from '../../palette/colours.js';
import type { EditorStrings } from '../strings.js';

/**
 * The open editor, handed to each canvas component as a prop. drei's Html mounts a separate
 * React root, so React context would not reach the DOM inside it.
 */
export interface EditorView {
  readonly ctx: EditorContext;
  readonly strings: EditorStrings;
  readonly palette: ScenePalette;
}

/** Height above the ground for lines and rings, so they do not flicker into the terrain. */
export const LIFT_M = 0.08;

/** z-index ranges for drei Html: labels under the floating toolbar. */
export const LAYERS = { label: 20, toolbar: 30, floor: 0 };

/** Labels in drei Html let the pointer through, so a drag under them keeps reaching the ground. */
export const PASS_THROUGH = { pointerEvents: 'none' } as const;
