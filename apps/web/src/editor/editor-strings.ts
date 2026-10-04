import type { EditorStrings } from '@parkshape/scene/editor';

import { messages } from '../messages';
import { viewerStrings } from '../viewer-strings';

/** The editor's text from the locale file, in the shape the scene package takes. */
export function editorStrings(): EditorStrings {
  const { editor, catalog, layers } = messages;
  return {
    viewer: viewerStrings(),
    catalog,
    categories: editor.categories,
    palette: editor.palette,
    tools: editor.tools,
    toolbar: editor.toolbar,
    reasons: editor.reasons,
    notices: editor.notices,
    properties: editor.properties,
    itemsList: editor.itemsList,
    shortcuts: editor.shortcuts,
    hints: editor.hints,
    smallScreen: editor.smallScreen,
    layers,
    terraform: editor.terraform,
  };
}
