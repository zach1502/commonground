import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useStore } from 'zustand';

import type { MetricsReport } from '@parkshape/core';

import { ContextLegend } from '../../context/ContextLegend.js';
import {
  useEditorContextLayers,
  type EditorSiteContext,
} from '../../context/use-editor-context-layers.js';
import type { EditorContext } from '../../editor/actions/context.js';
import { documentPropertyReader, readPalette } from '../../palette/colours.js';
import type { ForcedTier } from '../../perf/render-tier.js';
import type { AssetManifest } from '../../types.js';
import type { WalkProps } from '../../walk/walk-props.js';
import { editorColumns } from '../layout.js';
import { CanvasOverlays, DetailsSidebar, PlacingLine, ToolsSidebar } from '../Sidebars.js';
import type { EditorFeatures, EditorStrings } from '../strings.js';

import type { CanvasApi } from './bridges.js';
import type { EditorView } from './editor-view.js';
import { EditorCanvas } from './EditorCanvas.js';
import { useEditorKeys } from './use-editor-keys.js';
import { useEditorWalk } from './use-editor-walk.js';

export interface ParkEditorProps {
  readonly ctx: EditorContext;
  readonly strings: EditorStrings;
  readonly manifest?: AssetManifest | undefined;
  /** App content for the right column, such as the meters. */
  readonly details?: ReactNode;
  /** The live metrics report, so the scene can draw the problem overlays. */
  readonly report?: MetricsReport | null;
  /** Which optional tools the app enables; terraform is off by default. */
  readonly features?: EditorFeatures;
  readonly onCanvasApi?: ((api: CanvasApi) => void) | undefined;
  /** Called once the scene has loaded and the editor can take a change without startup work. */
  readonly onSceneReady?: (() => void) | undefined;
  /** Forces a render tier; test builds pass 'desktop-pinned' so screenshots show the real look. */
  readonly tier?: ForcedTier | undefined;
  /** Shown in place of the canvas when the browser has no WebGL2, such as a message and a link. */
  readonly webGlMissing?: ReactNode;
  /** The streets, sidewalks and stops around the park; the editor draws none without it. */
  readonly siteContext?: EditorSiteContext | undefined;
  /** "Walk the park" beside the view presets; the editor tools pause while walking. */
  readonly walk?: WalkProps | undefined;
}

const layoutStyle = {
  display: 'grid',
  blockSize: '100%',
  minBlockSize: 0,
} as const;
const columnStyle = {
  overflowY: 'auto',
  minBlockSize: 0,
  background: 'var(--surface-color-background-white)',
} as const;
const leftStyle = {
  ...columnStyle,
  borderInlineEnd: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
} as const;
const rightStyle = {
  ...columnStyle,
  borderInlineStart: 'var(--layout-border-width-small) solid var(--surface-color-border-default)',
} as const;
const centreStyle = { position: 'relative', minBlockSize: 0 } as const;
const overlayStyle = {
  position: 'absolute',
  insetInlineStart: 'var(--layout-margin-medium)',
  insetBlockEnd: 'var(--layout-margin-medium)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--layout-margin-small)',
} as const;

/** The whole editor: tools and palette, the 3D canvas, and properties with the Items list. */
export function ParkEditor(props: ParkEditorProps): ReactElement {
  const { ctx, strings } = props;
  const palette = useMemo(() => readPalette(documentPropertyReader()), []);
  const view = useMemo<EditorView>(() => ({ ctx, strings, palette }), [ctx, strings, palette]);
  const walk = useEditorWalk(ctx, props.walk);
  useEditorKeys(ctx, walk.mode);
  const contextLayers = useEditorContextLayers(ctx, props.siteContext);
  const details = useStore(ctx.store, (state) =>
    state.itemsList === 'shown' ? 'list' : 'standard',
  );
  return (
    <div style={{ ...layoutStyle, gridTemplateColumns: editorColumns(details) }}>
      <div style={leftStyle}>
        <ToolsSidebar
          ctx={ctx}
          strings={strings}
          {...(props.features === undefined ? {} : { features: props.features })}
        />
      </div>
      <div style={centreStyle}>
        <EditorCanvas
          view={view}
          manifest={props.manifest}
          report={props.report ?? null}
          onCanvasApi={props.onCanvasApi}
          onSceneReady={props.onSceneReady}
          tier={props.tier}
          webGlMissing={props.webGlMissing}
          contextLayers={contextLayers}
          walk={walk.walk}
        />
        <PlacingLine ctx={ctx} strings={strings} />
        <div style={overlayStyle}>
          <CanvasOverlays ctx={ctx} strings={strings} />
        </div>
      </div>
      <aside aria-label={strings.properties.heading} style={rightStyle}>
        {contextLayers.layer === undefined ? null : (
          <ContextLegend strings={strings.layers} visible={contextLayers.layer.visible} />
        )}
        <DetailsSidebar ctx={ctx} strings={strings}>
          {props.details}
        </DetailsSidebar>
      </aside>
    </div>
  );
}
