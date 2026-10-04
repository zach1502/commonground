import type { ReactElement } from 'react';

import type { EditorView } from '../editor-components/canvas/editor-view.js';

import { ContextLayer, type ContextLayerInput } from './ContextLayer.js';
import { EntranceMarker } from './EntranceMarker.js';

/**
 * The editor's share of the context: the layer on the recorded ground, which grading does not
 * move, and the marker on the sidewalk point an entrance snapped toward.
 */
export function EditorContextScene({
  view,
  layer,
}: {
  readonly view: EditorView;
  readonly layer: ContextLayerInput | undefined;
}): ReactElement {
  return (
    <>
      {layer === undefined ? null : (
        <ContextLayer {...layer} heightmap={view.ctx.baseHeightmap} palette={view.palette} />
      )}
      <EntranceMarker view={view} />
    </>
  );
}
