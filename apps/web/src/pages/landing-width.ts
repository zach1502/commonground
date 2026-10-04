/**
 * The editor's desktop breakpoint, the same number as `screenSize` in @parkshape/scene/editor.
 * The landing page ships in the entry chunk, so it keeps its own copy and a test holds the two
 * equal; importing the editor subpath would pull the editor store into the first load.
 */
export const EDITOR_MIN_WIDTH_PX = 1024;

export type LandingLayout = 'design-first' | 'vote-first';

/** Below the breakpoint the editor does not open, so voting is the filled button. */
export function landingLayout(widthPx: number): LandingLayout {
  return widthPx < EDITOR_MIN_WIDTH_PX ? 'vote-first' : 'design-first';
}
