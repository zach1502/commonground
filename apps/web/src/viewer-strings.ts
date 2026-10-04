import type { ViewerStrings, WalkStrings } from '@parkshape/scene/viewer';

import { messages } from './messages';

/** The 3D viewer's text from the locale file. Kept apart from the editor's so viewer pages skip it. */
export function viewerStrings(): ViewerStrings {
  return messages.editor.viewer;
}

/** The park walk's text from the locale file. */
export function walkStrings(): WalkStrings {
  return messages.walk;
}
