import { useProgress } from '@react-three/drei';
import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type { Heightmap, Random } from '@parkshape/core';
import { createSeededRandom } from '@parkshape/core';

import { useModelManifest } from '../assets/use-model-manifest.js';
import type { PresetName } from '../camera/presets.js';
import { ContextLayer, type ContextLayerInput } from '../context/ContextLayer.js';
import { motionPreference } from '../motion/rise.js';
import { CompareToggle } from '../overlay/CompareToggle.js';
import type { CompareShowing } from '../overlay/CompareToggle.js';
import { LoadingOverlay } from '../overlay/LoadingOverlay.js';
import { SceneGate } from '../overlay/SceneGate.js';
import type { ViewerStrings } from '../overlay/strings.js';
import { toolbarStyle } from '../overlay/styles.js';
import { ViewPresets } from '../overlay/ViewPresets.js';
import { documentPropertyReader, readPalette, type ScenePalette } from '../palette/colours.js';
import type { ForcedTier, RenderTier } from '../perf/render-tier.js';
import { useReviewScene } from '../review/use-review-scene.js';
import { buildSceneModel } from '../scene-model.js';
import type { AssetManifest, CatalogItem, ParkDocument } from '../types.js';
import { useWalkScene, type WalkScene } from '../walk/use-walk-scene.js';

import type { ViewRequest } from './Controls.js';
import { frameloopFor } from './frameloop.js';
import type { SceneInspector } from './inspect.js';
import { useRenderProfile } from './use-render-profile.js';
import type { RenderProfileState } from './use-render-profile.js';
import type { ReviewLayerProps, WalkProps } from './viewer-modes.js';
import { ViewerCanvas } from './ViewerCanvas.js';
import type { DrawingBuffer } from './ViewerCanvas.js';
import { ViewerProbeBridge, type ViewerProbe } from './ViewerProbe.js';

// A fixed seed keeps tree sizes and bed jitter the same on every render of a design.
const SCENE_SEED = 9;

export interface ParkViewerProps {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  readonly catalog: readonly CatalogItem[];
  /** GLB models by model key; without it the viewer loads the web app's models index. */
  readonly manifest?: AssetManifest;
  readonly mode: 'view' | 'compare';
  readonly strings: ViewerStrings;
  /** Ground before the design changed it; defaults to heightmap. */
  readonly todayHeightmap?: Heightmap;
  readonly random?: Random;
  readonly onReady?: () => void;
  readonly onFrameTime?: (frameMs: number) => void;
  /** Extra scene content on the island, such as a heatmap overlay. */
  readonly children?: ReactNode;
  readonly drawingBuffer?: DrawingBuffer;
  /** Forces a render tier, as the dev page's ?tier= does; the viewer probes the device without it. */
  readonly tier?: ForcedTier;
  readonly onRenderTier?: (tier: RenderTier) => void;
  /** Test hook for the dev page: reads the live renderer settings. */
  readonly onInspect?: (inspect: SceneInspector) => void;
  /** Shown in place of the 3D view when the browser has no WebGL2, such as a message and a link. */
  readonly webGlMissing?: ReactNode;
  /** Review mode: a tap selects an element, its outline shows and count chips sit on elements. */
  readonly review?: ReviewLayerProps;
  /** The park walk: "Walk the park" in the toolbar drops the camera to eye height. */
  readonly walk?: WalkProps;
  /** The page's own controls at the end of the view toolbar, such as Hide items on insights. */
  readonly tools?: ReactNode;
  /** The streets and sidewalks around the park, drawn read-only; nothing draws without it. */
  readonly context?: ContextLayerInput | undefined;
  /** Test hook for test builds: projects ground points to the page and reads the camera. */
  readonly onProbe?: ((probe: ViewerProbe) => void) | undefined;
}

const frameStyle = { position: 'relative', inlineSize: '100%', blockSize: '100%' } as const;
// The sky colour behind the canvas too, so the page shows no flash before the first frame.
const canvasStyleFor = (sky: string) =>
  ({ position: 'absolute', inset: 0, background: sky }) as const;

function useSceneModel({ heightmap, document, catalog, random }: ParkViewerProps) {
  return useMemo(
    () =>
      buildSceneModel({
        heightmap,
        document,
        catalog,
        random: random ?? createSeededRandom(SCENE_SEED),
      }),
    [heightmap, document, catalog, random],
  );
}

interface ViewerToolbarProps {
  readonly strings: ViewerStrings;
  readonly mode: ParkViewerProps['mode'];
  readonly showing: CompareShowing;
  readonly onShowing: (showing: CompareShowing) => void;
  readonly onPreset: (preset: PresetName) => void;
  /** More controls at the end, such as "Walk the park". */
  readonly extra?: ReactNode;
  /** The page's own controls, after the viewer's. */
  readonly tools?: ReactNode;
}

/** The view presets, and the compare toggle in compare mode. */
function ViewerToolbar(props: ViewerToolbarProps): ReactElement {
  const { strings, showing } = props;
  return (
    <div style={toolbarStyle}>
      <ViewPresets labels={strings} onSelect={props.onPreset} />
      {props.mode === 'compare' ? (
        <CompareToggle
          label={strings.compareWithToday}
          showing={showing}
          onChange={props.onShowing}
        />
      ) : null}
      {props.extra}
      {props.tools}
    </div>
  );
}

/** Loading until the scene reports its first drawn frames with the real models. */
function useLoadState(onReady: (() => void) | undefined) {
  const [loading, setLoading] = useState<'loading' | 'ready'>('loading');
  const handleReady = useCallback(() => {
    setLoading('ready');
    onReady?.();
  }, [onReady]);
  return { loading, handleReady };
}

interface ViewerLayersProps {
  readonly context: ParkViewerProps['context'];
  readonly onProbe: ParkViewerProps['onProbe'];
  readonly terrain: Heightmap;
  readonly palette: ScenePalette;
  /** The page's own scene content, such as a heatmap overlay. */
  readonly page: ReactNode;
  /** The review and walk layers, drawn after the page content. */
  readonly children: ReactNode;
}

/** Everything the viewer draws on the island besides the design: context, extras and probes. */
function ViewerLayers(props: ViewerLayersProps): ReactElement {
  const { terrain, palette } = props;
  return (
    <>
      {props.context === undefined ? null : (
        <ContextLayer {...props.context} heightmap={terrain} palette={palette} />
      )}
      {props.page}
      {props.onProbe === undefined ? null : (
        <ViewerProbeBridge terrain={terrain} onProbe={props.onProbe} />
      )}
      {props.children}
    </>
  );
}

/** The page's scene colours and the reader's motion setting, read once per viewer. */
function useSceneLook() {
  const palette = useMemo(() => readPalette(documentPropertyReader()), []);
  const motion = useMemo(motionPreference, []);
  return { palette, motion };
}

/** The camera preset the toolbar last asked for; each press counts, so a repeat moves again. */
function useViewRequest() {
  const [view, setView] = useState<ViewRequest>({ preset: 'reset', request: 0 });
  const setPreset = useCallback((preset: PresetName) => {
    setView((current) => ({ preset, request: current.request + 1 }));
  }, []);
  return { view, setPreset };
}

type ViewerFrameProps = ParkViewerProps & { readonly renderProfile: RenderProfileState };

/** The canvas with its toolbar and loading overlay, once the browser is known to have WebGL2. */
function ViewerFrame(props: ViewerFrameProps): ReactElement {
  const { heightmap, document, mode, strings, onReady, tools } = props;
  const [showing, setShowing] = useState<CompareShowing>('design');
  const { view, setPreset } = useViewRequest();
  const { loading, handleReady } = useLoadState(onReady);
  const { palette, motion } = useSceneLook();
  const model = useSceneModel(props);
  // The canvas waits for the models index, so its ready signal comes after the real models.
  const models = useModelManifest(props.manifest);
  const terrain = showing === 'today' ? (props.todayHeightmap ?? heightmap) : heightmap;
  const review = useReviewScene(props.review, { terrain, palette, motion, bounds: model.bounds });
  const walk = useWalkScene(props.walk, { document, terrain, motion, ready: loading });
  return (
    <div style={frameStyle}>
      <div
        role="img"
        aria-label={strings.canvasLabel}
        style={canvasStyleFor(palette.sky)}
        data-scene-ready={loading === 'ready' ? 'true' : 'false'}
      >
        {models.state === 'loading' ? null : (
          <ViewerCanvas
            heightmap={heightmap}
            terrain={terrain}
            document={document}
            model={model}
            palette={palette}
            motion={motion}
            showing={showing}
            view={view}
            manifest={models.manifest}
            onReady={handleReady}
            onFrameTime={props.onFrameTime}
            frameloop={frameloopFor(props.onFrameTime)}
            drawingBuffer={props.drawingBuffer}
            renderProfile={props.renderProfile}
            onInspect={props.onInspect}
            terrainEvents={review.terrainEvents}
          >
            <ViewerLayers
              context={props.context}
              onProbe={props.onProbe}
              terrain={terrain}
              palette={palette}
              page={props.children}
            >
              {review.layer}
              {walk.layer}
            </ViewerLayers>
          </ViewerCanvas>
        )}
      </div>
      <ViewerChrome
        toolbar={{ strings, mode, showing, tools, onShowing: setShowing, onPreset: setPreset }}
        walk={walk}
        loading={loading}
      />
    </div>
  );
}

interface ViewerChromeProps {
  readonly toolbar: ViewerToolbarProps;
  readonly walk: WalkScene;
  readonly loading: 'loading' | 'ready';
}

/** Everything drawn over the canvas: the toolbar or the walk's controls, and the loading cover. */
function ViewerChrome({ toolbar, walk, loading }: ViewerChromeProps): ReactElement {
  const { progress } = useProgress();
  return (
    <>
      {walk.mode === 'overview' ? <ViewerToolbar {...toolbar} extra={walk.startControl} /> : null}
      {walk.overlay}
      {loading === 'loading' ? (
        <LoadingOverlay progress={progress} message={toolbar.strings.loadingMessage} />
      ) : null}
    </>
  );
}

/** 3D view of one park design on its terrain, with view presets and compare with today. */
export function ParkViewer(props: ParkViewerProps): ReactElement {
  const renderProfile = useRenderProfile(props.tier, props.onRenderTier);
  return (
    <SceneGate caveat={renderProfile.profile.caveat} fallback={props.webGlMissing}>
      <ViewerFrame {...props} renderProfile={renderProfile} />
    </SceneGate>
  );
}
