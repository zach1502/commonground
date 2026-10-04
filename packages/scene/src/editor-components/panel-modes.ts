import type { Tool } from '../editor/store/types.js';

/** What the person is doing, which decides the panels around the canvas. */
export type EditorMode = 'select' | 'placing' | 'drawing' | 'terraform';

/** A right-column panel that depends on the mode; the Items list and meters stay in every mode. */
export type ModePanel = 'properties' | 'terraform';

export interface ModePanels {
  readonly mode: EditorMode;
  readonly palette: 'open' | 'folded';
  readonly details: readonly ModePanel[];
  /** The one-line status at the top of the canvas. */
  readonly canvasLine: 'placing' | 'none';
}

const PANELS: Readonly<Record<EditorMode, ModePanels>> = {
  select: { mode: 'select', palette: 'open', details: ['properties'], canvasLine: 'none' },
  placing: { mode: 'placing', palette: 'open', details: [], canvasLine: 'placing' },
  // A new area selects itself, and its plots and Add corner live in properties.
  drawing: { mode: 'drawing', palette: 'open', details: ['properties'], canvasLine: 'none' },
  terraform: { mode: 'terraform', palette: 'folded', details: ['terraform'], canvasLine: 'none' },
};

function modeOf(tool: Tool): EditorMode {
  switch (tool.kind) {
    case 'select':
      return 'select';
    case 'place':
      return 'placing';
    case 'terraform':
      return 'terraform';
    case 'path':
    case 'area':
    case 'zone':
    case 'add-corner':
      return 'drawing';
  }
}

/** The panels each mode shows, so the side columns hold only what the current task needs. */
export function panelsFor(tool: Tool): ModePanels {
  return PANELS[modeOf(tool)];
}
