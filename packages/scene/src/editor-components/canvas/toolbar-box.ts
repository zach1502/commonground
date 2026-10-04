import { placeToolbar } from '../../editor/toolbar-place.js';

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Where the toolbar's selection sits on the canvas this frame, in canvas pixels. */
export interface ToolbarFrame {
  readonly anchor: ScreenPoint;
  readonly ground: ScreenPoint;
  readonly canvas: { readonly width: number; readonly height: number };
}

// The gap kept between the toolbar and every canvas edge.
const EDGE_MARGIN_TOKEN = '--layout-margin-small';

/**
 * drei's wrapper lets the pointer through and only the toolbar itself takes it. The box starts
 * hidden: drei draws it once with its corner on the anchor, just above the item, before the
 * clamp has a size to work with, and a hidden box takes no press meant for the item.
 */
export const TOOLBAR_BOX_STYLE = {
  pointerEvents: 'auto',
  inlineSize: 'max-content',
  visibility: 'hidden',
} as const;

/** A length token in pixels, such as 0.5rem, read where the toolbar is drawn. */
function tokenPx(element: HTMLElement, name: string): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return 0;
  if (!value.endsWith('rem')) return amount;
  return amount * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
}

/**
 * The toolbar's top-left corner for this frame, kept inside the canvas. The box shows once it is
 * placed with a measured size, in the same frame that moves it there.
 */
export function placeToolbarBox(
  element: HTMLElement | null,
  frame: ToolbarFrame,
): [number, number] {
  const toolbar = { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0 };
  const place = placeToolbar({
    ...frame,
    toolbar,
    marginPx: element === null ? 0 : tokenPx(element, EDGE_MARGIN_TOKEN),
  });
  if (element !== null) {
    element.setAttribute('data-placement', place.placement);
    if (toolbar.width > 0) element.style.visibility = 'visible';
  }
  return [place.left, place.top];
}
