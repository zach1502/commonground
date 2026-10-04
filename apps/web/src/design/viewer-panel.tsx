import {
  CONTEXT_LAYER_DEFAULTS,
  designDocumentSchema,
  parcelSchema,
  type Parcel,
} from '@parkshape/core';
import {
  ParkViewer,
  viewerScene,
  type ContextLayerInput,
  type ForcedTier,
  type ReviewLayerProps,
  type WalkProps,
} from '@parkshape/scene/viewer';

import type { Design, Project } from '../api/web-api';
import { viewerStrings, walkStrings } from '../viewer-strings';

import { useModelManifest } from './use-model-manifest';
import { useProjectContext, type ContextApi } from './use-project-context';
import { useProjectTerrain, type TerrainApi } from './use-project-terrain';
import { useViewerTestHook, type ViewerHookProps } from './viewer-hook';
import { WebGlMissingNotice } from './webgl-missing-notice';

/** The page's part of the walk; WalkProps has the rest. */
export type PanelWalk = Pick<WalkProps, 'start' | 'onModeChange'> & {
  readonly labels: ReadonlyMap<string, string>;
};

export interface ViewerPanelProps {
  readonly design: Design;
  readonly project: Project;
  /** Reads the project's recorded ground, the one the still pictures draw. */
  readonly api: TerrainApi;
  /** Set only by test builds; see sceneTierFor. */
  readonly tier?: ForcedTier | undefined;
  /** 'on' only in test builds: puts the camera and screen probe on window for Playwright. */
  readonly testHook?: 'on' | 'off' | undefined;
  /** Review mode: tap to select, count chips. Left out, the view is read-only as before. */
  readonly review?: ReviewLayerProps | undefined;
  /** "Walk the park" in the toolbar, or started by the page; item names for the "Near ..." line. */
  readonly walk?: PanelWalk | undefined;
  /**
   * The default context layers around the park, read-only with no Layers menu. The vote card
   * leaves the street names off to fit the phone; left out, no context is fetched or drawn.
   */
  readonly streets?: { readonly api: ContextApi; readonly names: 'shown' | 'hidden' } | undefined;
}

/** The default layers once the context is in; nothing while it loads or after it failed. */
function streetsLayer(
  load: ReturnType<typeof useProjectContext>,
  names: 'shown' | 'hidden',
): ContextLayerInput | undefined {
  if (load.kind !== 'ready') return undefined;
  return { context: load.context, visible: CONTEXT_LAYER_DEFAULTS, streetNames: names };
}

/** The walk props for the parcel, with x and y of the plan as x and z on the ground. */
function walkFor(parcel: Parcel, walk: PanelWalk, hook: ViewerHookProps | undefined): WalkProps {
  const ground = parcel.polygon.map((point) => ({ x: point.x, z: point.y }));
  const page = walk.onModeChange;
  const probe = hook?.walk.onModeChange;
  // A test build's probe hears each mode change too, without taking it from the page.
  const onModeChange = (mode: 'walk' | 'overview') => {
    probe?.(mode);
    page?.(mode);
  };
  return { parcel: ground, strings: walkStrings(), ...walk, ...hook?.walk, onModeChange };
}

/** The forced tier, review mode and walk, each only when the page asks for it. */
function optionalModes(
  { tier, review, walk }: ViewerPanelProps,
  parcel: Parcel,
  hook: ViewerHookProps | undefined,
) {
  return {
    ...(tier === undefined ? {} : { tier }),
    ...(review === undefined ? {} : { review }),
    ...(walk === undefined ? {} : { walk: walkFor(parcel, walk, hook) }),
  };
}

/** The read-only 3D view of a design. Loaded on its own so pages without it skip three.js. */
export function ViewerPanel(props: ViewerPanelProps) {
  const { design, project, api, streets } = props;
  const models = useModelManifest();
  const hook = useViewerTestHook(props.testHook ?? 'off');
  const terrain = useProjectTerrain(api, project.id);
  const context = streetsLayer(
    useProjectContext(streets?.api, project.id),
    streets?.names ?? 'hidden',
  );
  // The viewer mounts once the models index and the terrain are in, so it draws the real models
  // on the real ground from the start.
  if (models.state === 'loading' || terrain.state === 'loading') return null;
  const document = designDocumentSchema.parse(design.document);
  const parcel = parcelSchema.parse(project.parcel);
  const scene = viewerScene(document, parcel, terrain.heightmap);
  return (
    <ParkViewer
      heightmap={scene.heightmap}
      document={scene.document}
      catalog={scene.catalog}
      manifest={models.manifest}
      mode="view"
      strings={viewerStrings()}
      webGlMissing={<WebGlMissingNotice projectId={project.id} />}
      {...optionalModes(props, parcel, hook)}
      context={context}
      onProbe={hook?.onProbe}
    />
  );
}
