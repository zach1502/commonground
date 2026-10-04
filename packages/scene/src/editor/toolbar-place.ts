interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

interface BoxSize {
  readonly width: number;
  readonly height: number;
}

export interface ToolbarPlaceInput {
  /** The point the toolbar sits on, above the selection, in canvas pixels. */
  readonly anchor: ScreenPoint;
  /** The selection's ground point in canvas pixels; the toolbar hangs under it when flipped. */
  readonly ground: ScreenPoint;
  readonly toolbar: BoxSize;
  readonly canvas: BoxSize;
  /** The gap kept from every canvas edge, from the layout margin token. */
  readonly marginPx: number;
}

export interface ToolbarPlace {
  readonly left: number;
  readonly top: number;
  readonly placement: 'above' | 'below';
}

const HALF = 0.5;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * The toolbar's top-left corner in canvas pixels. It is centred over its anchor and slid in from
 * the side edges. Without room above, it flips under the selection; in every case the whole box
 * stays inside the canvas by the margin, so no button is ever cut off.
 */
export function placeToolbar(input: ToolbarPlaceInput): ToolbarPlace {
  const { anchor, ground, toolbar, canvas, marginPx } = input;
  const right = Math.max(canvas.width - marginPx - toolbar.width, marginPx);
  const bottom = Math.max(canvas.height - marginPx - toolbar.height, marginPx);
  const left = clamp(anchor.x - toolbar.width * HALF, marginPx, right);
  const above = anchor.y - toolbar.height;
  if (above >= marginPx) return { left, top: Math.min(above, bottom), placement: 'above' };
  return { left, top: clamp(ground.y + marginPx, marginPx, bottom), placement: 'below' };
}
