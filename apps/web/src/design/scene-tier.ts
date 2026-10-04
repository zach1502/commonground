import type { ForcedTier } from '@parkshape/scene/viewer';

import type { EditorDeps } from '../app-deps';

const TIER_PARAM = 'tier';
const DESKTOP = 'desktop';

/**
 * The render tier a page forces on its 3D view. Only a test build (VITE_EDITOR_TEST_HOOK=on)
 * honours `?tier=desktop`, so screenshots in software WebGL show the desktop look. For real
 * users this is always undefined and the viewer's own device probe and decline stay in charge.
 */
export function sceneTierFor(
  testHook: EditorDeps['testHook'],
  search: string = window.location.search,
): ForcedTier | undefined {
  if (testHook !== 'on') return undefined;
  return new URLSearchParams(search).get(TIER_PARAM) === DESKTOP ? 'desktop-pinned' : undefined;
}
