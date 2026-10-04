import { useProgress } from '@react-three/drei';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useStore } from 'zustand';

import { withGradeDelta } from '@parkshape/core';
import type { Heightmap, MetricsReport } from '@parkshape/core';

import { useModelManifest } from '../../assets/use-model-manifest.js';
import type { PresetName } from '../../camera/presets.js';
import type { ViewRequest } from '../../components/Controls.js';
import { useRenderProfile } from '../../components/use-render-profile.js';
import type { RenderProfileState } from '../../components/use-render-profile.js';
import { ViewerCanvas } from '../../components/ViewerCanvas.js';
import { EditorContextScene } from '../../context/EditorContextScene.js';
import type { EditorContextLayers } from '../../context/use-editor-context-layers.js';
import { cursorForTool } from '../../editor/actions/cursor.js';
import { previewDocument } from '../../editor/actions/selecting.js';
import { NO_VARIATION, sceneCatalogOf, toParkDocument } from '../../editor/document-adapter.js';
import { groupInstances } from '../../geometry/instances.js';
import { heightmapBounds } from '../../geometry/sample.js';
import type { PlacementMotion } from '../../motion/placement-motion.js';
import { motionPreference, type MotionPreference } from '../../motion/rise.js';
import {
  usePlacementMotion,
  type PlacementMotionState,
} from '../../motion/use-placement-motion.js';
import { ContextLayersMenu } from '../../overlay/ContextLayersMenu.js';
import { LoadingOverlay } from '../../overlay/LoadingOverlay.js';
import { SceneGate } from '../../overlay/SceneGate.js';
import { toolbarStyle } from '../../overlay/styles.js';
import { ViewPresets } from '../../overlay/ViewPresets.js';
import type { ForcedTier } from '../../perf/render-tier.js';
import { buildSceneModel } from '../../scene-model.js';
import type { AssetManifest } from '../../types.js';
import { useWalkScene, type WalkScene } from '../../walk/use-walk-scene.js';
import type { WalkProps } from '../../walk/walk-props.js';

import { AreaOverlay } from './AreaOverlay.js';
import { CameraBridge, ControlsBridge, type CanvasApi } from './bridges.js';
import type { EditorView } from './editor-view.js';
import { ForbiddenZoneOverlay } from './ForbiddenZoneOverlay.js';
import { PathOverlay } from './PathOverlay.js';
import { PlacingOverlay } from './PlacingOverlay.js';
import { ProgramKeeper } from './ProgramKeeper.js';
import { MarqueeBox, SelectionOverlay } from './SelectionOverlay.js';
import { SettlingItems, type SettleVeil, type SettlingItemsProps } from './SettlingItems.js';
import { SteepSegmentHighlight } from './SteepSegmentHighlight.js';
import { TerraformTool } from './TerraformTool.js';
import { useTerrainGestures, type ControlsHandle } from './use-terrain-gestures.js';

export interface EditorCanvasProps {
  readonly view: EditorView;
  readonly manifest?: AssetManifest | undefined;
  readonly report?: MetricsReport | null;
  readonly onCanvasApi?: ((api: CanvasApi) => void) | undefined;
  /** Called once the scene has loaded and the overlay shaders are compiled. */
  readonly onSceneReady?: (() => void) | undefined;
  readonly tier?: ForcedTier | undefined;
  /** Shown in place of the canvas when the browser has no WebGL2. */
  readonly webGlMissing?: ReactNode;
  /** The streets around the park and the Layers menu; nothing extra draws without it. */
  readonly contextLayers?: EditorContextLayers | undefined;
  /** "Walk the park" in the toolbar; while walking, the terrain takes no edits. */
  readonly walk?: WalkProps | undefined;
}

const NO_CONTEXT: EditorContextLayers = { layer: undefined, menu: undefined };

const ignoreSceneReady = (): void => undefined;

const frameStyle = {
  position: 'relative',
  inlineSize: '100%',
  blockSize: '100%',
  background: 'var(--surface-color-background-light-blue)',
} as const;

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();
const DEGREES_PER_TURN = 360;

/** A ghost-sized box over each point item that settles or lifts. */
function settleVeilsOf(view: EditorView, placement: PlacementMotion | null): SettleVeil[] {
  if (placement === null) return [];
  return placement.items.flatMap((item) => {
    const entry = view.ctx.catalog.get(item.catalogId);
    if (entry?.geometryKind !== 'point') return [];
    const { widthM, depthM } = entry.footprint;
    const rotationY = (-item.rotationDeg / DEGREES_PER_TURN) * (Math.PI + Math.PI);
    const groundM = view.ctx.elevationAt(item.position);
    const { x, y: z } = item.position;
    return [{ x, groundM, z, widthM, depthM, heightM: entry.heightM, rotationY }];
  });
}

/** Items the instanced draw leaves out while they settle, so the settling copy is the only one. */
function hiddenWhileSettling(placement: PlacementMotion | null): ReadonlySet<string> {
  if (placement?.kind !== 'settle') return NOTHING_HIDDEN;
  return new Set(placement.items.map((item) => item.id));
}

function useSceneModel(view: EditorView, placement: PlacementMotion | null) {
  const { ctx } = view;
  const document = useStore(ctx.store, (state) => state.document);
  const drag = useStore(ctx.store, (state) => state.drag);
  const selection = useStore(ctx.store, (state) => state.selection);
  const heightmap = useMemo(
    () => withGradeDelta(ctx.baseHeightmap, document.gradeDelta),
    [ctx.baseHeightmap, document.gradeDelta],
  );
  const preview = useMemo(
    () => previewDocument({ ...ctx.store.getState(), document, drag, selection }),
    [ctx.store, document, drag, selection],
  );
  const hidden = useMemo(() => hiddenWhileSettling(placement), [placement]);
  const park = useMemo(() => {
    const items = preview.items.filter((item) => !hidden.has(item.id));
    return toParkDocument({ ...preview, items }, ctx.catalog);
  }, [preview, hidden, ctx.catalog]);
  const catalog = useMemo(() => sceneCatalogOf([...ctx.catalog.values()]), [ctx.catalog]);
  const model = useMemo(
    () => buildSceneModel({ heightmap, document: park, catalog, random: NO_VARIATION }),
    [heightmap, park, catalog],
  );
  const settling = useMemo(() => {
    if (placement === null) return null;
    const items = toParkDocument({ ...preview, items: [...placement.items] }, ctx.catalog).items;
    return groupInstances({ heightmap, items, catalog, random: NO_VARIATION });
  }, [placement, preview, ctx.catalog, heightmap, catalog]);
  const veils = useMemo(() => settleVeilsOf(view, placement), [view, placement]);
  return { park, model, heightmap, settling, veils };
}

/** The 3D editor: the viewer's canvas plus the ghost, handles and gestures on the terrain. */
type Gestures = ReturnType<typeof useTerrainGestures>;

interface SceneOverlaysProps {
  readonly view: EditorView;
  readonly report: MetricsReport | null;
  readonly heightmap: Heightmap;
  readonly gesture: Gestures['gesture'];
  readonly onHandleDown: Gestures['onHandleDown'];
  readonly controls: { current: ControlsHandle | null };
  readonly onCanvasApi?: ((api: CanvasApi) => void) | undefined;
  readonly onSceneReady: () => void;
  readonly motion: MotionPreference;
  readonly settling: SettlingItemsProps;
}

/** The R3F children drawn over the terrain: tool overlays, the problem overlays and the bridges. */
function SceneOverlays(props: SceneOverlaysProps): ReactElement {
  const { view, report, heightmap, gesture, onHandleDown, controls, onCanvasApi, motion } = props;
  return (
    <>
      <ProgramKeeper view={view} onReady={props.onSceneReady} />
      <PlacingOverlay view={view} />
      <SettlingItems {...props.settling} />
      <SelectionOverlay view={view} />
      <PathOverlay view={view} gesture={gesture} onHandleDown={onHandleDown} />
      <AreaOverlay view={view} gesture={gesture} onHandleDown={onHandleDown} />
      <ForbiddenZoneOverlay view={view} report={report} />
      <SteepSegmentHighlight view={view} report={report} heightmap={heightmap} />
      <MarqueeBox view={view} marquee={gesture.kind === 'marquee' ? gesture : null} />
      <TerraformTool view={view} controls={controls} />
      <ControlsBridge target={controls} />
      {onCanvasApi === undefined ? null : (
        <CameraBridge
          elevationAt={view.ctx.elevationAt}
          bounds={heightmapBounds(heightmap)}
          onCanvasApi={onCanvasApi}
          motion={motion}
        />
      )}
    </>
  );
}

/** The test hook screenshots wait for: true once the scene has drawn with its textures. */
const readyFlag = (loading: 'loading' | 'ready') => ({
  'data-scene-ready': loading === 'ready' ? 'true' : 'false',
});

/** Loading until the scene reports ready; the progress drives the loading overlay. */
function useLoadState() {
  const [loading, setLoading] = useState<'loading' | 'ready'>('loading');
  const { progress } = useProgress();
  const onReady = useCallback(() => {
    setLoading('ready');
  }, []);
  return { loading, progress, onReady };
}

/** The canvas section's cursor and hover markers, driven by the active tool. */
function useSectionChrome(ctx: EditorView['ctx'], loading: 'loading' | 'ready') {
  const cursor = useStore(ctx.store, cursorForTool);
  const hovering = useStore(ctx.store, (state) => state.hovered !== null && state.drag === null);
  return {
    style: { ...frameStyle, cursor },
    'data-editor-cursor': cursor,
    'data-editor-hover': hovering ? 'item' : 'none',
    ...readyFlag(loading),
  };
}

/** What the settling items need to step the placement motion that is playing, if any. */
function settleDriveOf(placement: PlacementMotionState, preference: MotionPreference) {
  const { current } = placement;
  return current === null ? null : { motion: current, preference, onDone: placement.finish };
}

/** The reader's motion setting, the scene model and the placement motion playing on it. */
function useEditorScene(view: EditorView, manifest: AssetManifest | undefined) {
  const motion = useMemo(motionPreference, []);
  const placement = usePlacementMotion(view.ctx.store, motion);
  const { park, model, heightmap, settling, veils } = useSceneModel(view, placement.current);
  const { palette } = view;
  const settle = settleDriveOf(placement, motion);
  const items: SettlingItemsProps = {
    groups: settling,
    veils,
    colour: palette.success,
    settle,
    palette,
    manifest,
  };
  return { motion, park, model, heightmap, settling: items };
}

/**
 * The view presets, "Walk the park" and the Layers menu once the site context has loaded or
 * failed. While walking, the walk's own controls take the toolbar's place.
 */
function CanvasToolbar({
  view,
  layers,
  onPreset,
  walk,
}: {
  readonly view: EditorView;
  readonly layers: EditorContextLayers;
  readonly onPreset: (preset: PresetName) => void;
  readonly walk: WalkScene;
}): ReactElement {
  const { menu } = layers;
  if (walk.mode === 'walk') return <>{walk.overlay}</>;
  return (
    <div style={toolbarStyle}>
      <ViewPresets labels={view.strings.viewer} onSelect={onPreset} />
      {walk.startControl}
      {menu === undefined ? null : <ContextLayersMenu strings={view.strings.layers} {...menu} />}
    </div>
  );
}

/** The camera preset the toolbar last asked for; each press counts, so a repeat moves again. */
function usePresetRequest(onCameraStart: () => void) {
  const [request, setRequest] = useState<ViewRequest>({ preset: 'reset', request: 0 });
  const onPreset = (preset: PresetName) => {
    setRequest((current) => ({ preset, request: current.request + 1 }));
    onCameraStart();
  };
  return { request, onPreset };
}

type EditorFrameProps = EditorCanvasProps & { readonly renderProfile: RenderProfileState };

function EditorFrame(props: EditorFrameProps): ReactElement {
  const { view, report, onCanvasApi } = props;
  const models = useModelManifest(props.manifest);
  const manifest = models.state === 'ready' ? models.manifest : undefined;
  const { ctx, strings, palette } = view;
  const controls = useRef<ControlsHandle | null>(null);
  const { loading, progress, onReady } = useLoadState();
  const { motion, park, model, heightmap, settling } = useEditorScene(view, manifest);
  const { events, onHandleDown, gesture } = useTerrainGestures(view, controls);
  const walk = useWalkScene(props.walk, { document: park, terrain: heightmap, motion });
  const onCameraStart = useCallback(() => {
    ctx.store.getState().hintEvent('camera-moved');
  }, [ctx.store]);
  const { request, onPreset } = usePresetRequest(onCameraStart);
  return (
    <section aria-label={strings.viewer.canvasLabel} {...useSectionChrome(ctx, loading)}>
      <ViewerCanvas
        heightmap={heightmap}
        terrain={heightmap}
        document={park}
        model={model}
        palette={palette}
        motion={motion}
        showing="design"
        view={request}
        manifest={manifest}
        onReady={onReady}
        terrainEvents={walk.mode === 'walk' ? undefined : events}
        onCameraStart={onCameraStart}
        keys={walk.mode === 'walk' ? 'none' : 'canvas'}
        frameloop="demand"
        renderProfile={props.renderProfile}
      >
        <EditorContextScene view={view} layer={(props.contextLayers ?? NO_CONTEXT).layer} />
        <SceneOverlays
          view={view}
          report={report ?? null}
          heightmap={heightmap}
          gesture={gesture}
          onHandleDown={onHandleDown}
          controls={controls}
          onCanvasApi={onCanvasApi}
          onSceneReady={props.onSceneReady ?? ignoreSceneReady}
          motion={motion}
          settling={settling}
        />
        {walk.layer}
      </ViewerCanvas>
      <CanvasToolbar
        view={view}
        layers={props.contextLayers ?? NO_CONTEXT}
        onPreset={onPreset}
        walk={walk}
      />
      {loading === 'loading' ? (
        <LoadingOverlay progress={progress} message={strings.viewer.loadingMessage} />
      ) : null}
    </section>
  );
}

/** The editor canvas, or the no-WebGL2 message in its place. */
export function EditorCanvas(props: EditorCanvasProps): ReactElement {
  const renderProfile = useRenderProfile(props.tier, undefined);
  return (
    <SceneGate caveat={renderProfile.profile.caveat} fallback={props.webGlMissing}>
      <EditorFrame {...props} renderProfile={renderProfile} />
    </SceneGate>
  );
}
