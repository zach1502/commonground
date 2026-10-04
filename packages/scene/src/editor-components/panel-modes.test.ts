import { describe, expect, it } from 'vitest';

import type { Tool } from '../editor/store/types.js';

import { panelsFor } from './panel-modes.js';

const SELECT: Tool = { kind: 'select' };
const PLACE: Tool = { kind: 'place', catalogId: 'bench' };
const TERRAFORM: Tool = { kind: 'terraform' };
const PATH: Tool = { kind: 'path', surface: 'gravel', draft: [] };
const AREA: Tool = { kind: 'area', catalogId: 'community-garden', draft: null };
const CORNER: Tool = { kind: 'add-corner', areaId: 'a1' };

describe('panelsFor', () => {
  it('shows the palette and properties, and no canvas line, while selecting', () => {
    expect(panelsFor(SELECT)).toEqual({
      mode: 'select',
      palette: 'open',
      details: ['properties'],
      canvasLine: 'none',
    });
  });

  it('shows the palette and the placing line, and drops properties, while placing', () => {
    expect(panelsFor(PLACE)).toEqual({
      mode: 'placing',
      palette: 'open',
      details: [],
      canvasLine: 'placing',
    });
  });

  it('folds the palette and shows the brush with its readout while terraforming', () => {
    expect(panelsFor(TERRAFORM)).toEqual({
      mode: 'terraform',
      palette: 'folded',
      details: ['terraform'],
      canvasLine: 'none',
    });
  });

  it('keeps properties while drawing, so a new area shows its plots and Add corner', () => {
    for (const tool of [PATH, AREA, CORNER]) {
      expect(panelsFor(tool)).toMatchObject({
        mode: 'drawing',
        palette: 'open',
        details: ['properties'],
      });
    }
  });
});
