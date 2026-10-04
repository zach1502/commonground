/** DESIGN.md: the editor is for desktop only. Below this width it shows a notice instead. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

export type ScreenSize = 'small' | 'desktop';

export function screenSize(widthPx: number): ScreenSize {
  return widthPx < DESKTOP_MIN_WIDTH_PX ? 'small' : 'desktop';
}
