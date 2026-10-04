import { describe, expect, it } from 'vitest';

import { placeToolbar, type ToolbarPlaceInput } from './toolbar-place.js';

const CANVAS = { width: 800, height: 600 };
const TOOLBAR = { width: 240, height: 40 };
const MARGIN = 8;

function input(anchor: { x: number; y: number }, ground = anchor): ToolbarPlaceInput {
  return {
    anchor,
    ground: { x: ground.x, y: ground.y + 60 },
    toolbar: TOOLBAR,
    canvas: CANVAS,
    marginPx: MARGIN,
  };
}

function inside(place: { left: number; top: number }): boolean {
  return (
    place.left >= MARGIN &&
    place.top >= MARGIN &&
    place.left + TOOLBAR.width <= CANVAS.width - MARGIN &&
    place.top + TOOLBAR.height <= CANVAS.height - MARGIN
  );
}

describe('placeToolbar (leftover A: the toolbar clipped at the canvas edge)', () => {
  it('centres the toolbar above its anchor when there is room', () => {
    expect(placeToolbar(input({ x: 400, y: 300 }))).toEqual({
      left: 280,
      top: 260,
      placement: 'above',
    });
  });

  it('slides the toolbar in from the left and right edges, keeping the margin', () => {
    expect(placeToolbar(input({ x: 20, y: 300 })).left).toBe(MARGIN);
    expect(placeToolbar(input({ x: 790, y: 300 })).left).toBe(
      CANVAS.width - MARGIN - TOOLBAR.width,
    );
  });

  it('flips below the selection when the anchor is too near the top', () => {
    const place = placeToolbar(input({ x: 400, y: 30 }));
    expect(place.placement).toBe('below');
    expect(place.top).toBe(30 + 60 + MARGIN);
  });

  it('pushes the toolbar up from the bottom edge', () => {
    expect(placeToolbar(input({ x: 400, y: 640 })).top).toBe(
      CANVAS.height - MARGIN - TOOLBAR.height,
    );
  });

  it('keeps the whole box inside the canvas for anchors at every corner and beyond', () => {
    const corners = [
      { x: -50, y: -50 },
      { x: 850, y: -50 },
      { x: -50, y: 650 },
      { x: 850, y: 650 },
      { x: 0, y: 0 },
      { x: 800, y: 600 },
    ];
    for (const corner of corners) expect(inside(placeToolbar(input(corner)))).toBe(true);
  });

  it('pins a toolbar wider than the canvas to the left margin', () => {
    const wide = { ...input({ x: 100, y: 300 }), toolbar: { width: 900, height: 40 } };
    expect(placeToolbar(wide).left).toBe(MARGIN);
  });
});
