// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { placeToolbarBox, TOOLBAR_BOX_STYLE } from './toolbar-box.js';

const FRAME = {
  anchor: { x: 400, y: 300 },
  ground: { x: 400, y: 340 },
  canvas: { width: 800, height: 600 },
};

/** A toolbar box as drei's Html root mounts it, with the size layout gave it. */
function toolbarBox(size: { width: number; height: number }): HTMLDivElement {
  const box = document.createElement('div');
  Object.assign(box.style, TOOLBAR_BOX_STYLE);
  Object.defineProperty(box, 'offsetWidth', { value: size.width });
  Object.defineProperty(box, 'offsetHeight', { value: size.height });
  return box;
}

describe('placeToolbarBox', () => {
  it('starts hidden, so an unplaced toolbar cannot take a press meant for the item under it', () => {
    expect(TOOLBAR_BOX_STYLE.visibility).toBe('hidden');
    expect(toolbarBox({ width: 0, height: 0 }).style.visibility).toBe('hidden');
  });

  it('stays hidden while the box has no measured size', () => {
    const box = toolbarBox({ width: 0, height: 0 });
    placeToolbarBox(box, FRAME);
    expect(box.style.visibility).toBe('hidden');
  });

  it('shows the box once it is placed with its measured size, centred above the anchor', () => {
    const box = toolbarBox({ width: 300, height: 40 });
    expect(placeToolbarBox(box, FRAME)).toEqual([250, 260]);
    expect(box.style.visibility).toBe('visible');
    expect(box.getAttribute('data-placement')).toBe('above');
  });

  it('places nothing over the anchor before the box has mounted', () => {
    expect(placeToolbarBox(null, FRAME)).toEqual([400, 300]);
  });
});
