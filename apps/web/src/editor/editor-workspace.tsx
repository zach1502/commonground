import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  catalogIndex,
  createSeededRandom,
  designDocumentSchema,
  parcelSchema,
  projectParametersSchema,
  zoneSchema,
  type ConstraintKey,
  type Heightmap,
  type MetricsReport,
} from '@parkshape/core';
import {
  assetManifestFromModels,
  createMetricsClient,
  frameTargetForConstraint,
  type AssetManifest,
  type CanvasApi,
  type EditorContext,
} from '@parkshape/scene/editor';

import type { Design, Project, User } from '../api/web-api';
import type { EditorDeps, WebDeps } from '../app-deps';
import { sceneTierFor } from '../design/scene-tier';
import { SubmitDialog } from '../design/submit-dialog';
import { WebGlMissingNotice } from '../design/webgl-missing-notice';
import { format, messages } from '../messages';
import { loginRedirect } from '../routing/guards';
import { PATHS } from '../routing/paths';

import { BriefPanel } from './brief-panel';
import { selectedForBrief, type BriefSelection } from './brief-selection';
import { EditorBar } from './editor-bar';
import { openEditorSession, type EditorSession } from './editor-session';
import { editorStrings } from './editor-strings';
import { useEditorWalk } from './editor-walk';
import { MetersPanel, type MetersPanelStrings } from './meters-panel';
import { pressSubmit } from './submit-gate';
import { installTestHook } from './test-hook';
import { useAutosave, type DraftSaves } from './use-autosave';
import { useEditorReadyMark, type SceneReadiness } from './use-editor-ready';
import { useEditorSiteContext } from './use-editor-site-context';
import { useLiveMetrics } from './use-live-metrics';
import { useSubmitDialog } from './use-submit-dialog';

const METRICS_DEBOUNCE_MS = 150;
const metersStrings = messages.editor.meters as MetersPanelStrings;

// The 3D editor loads on its own, so pages without it do not download three.js.
const ParkEditor = lazy(async () => ({ default: (await import('@parkshape/scene')).ParkEditor }));

const MODELS_INDEX = '/models/index.json';
const strings = editorStrings();

export interface EditorWorkspaceProps {
  readonly user: User;
  readonly project: Project;
  readonly design: Design;
  /** The park today; the meters count a kept garden's recorded plots from it. */
  readonly baseline?: Design | null;
  /** The project's recorded ground; null draws the flat parcel grid. */
  readonly terrain?: Heightmap | null;
  readonly deps: Pick<WebDeps, 'api' | 'editor'>;
}

function useEditorContext(props: EditorWorkspaceProps, editor: EditorDeps) {
  const { design, project, user, terrain } = props;
  const [session, setSession] = useState<EditorSession | null>(null);
  useEffect(() => {
    const opened = openEditorSession({
      designId: design.id,
      userId: user.id,
      document: designDocumentSchema.parse(design.document),
      updatedAt: design.updatedAt,
      parcel: parcelSchema.parse(project.parcel),
      zones: zoneSchema.array().parse(project.parameters.forbiddenZones),
      catalog: catalogIndex,
      random: createSeededRandom(editor.randomSeed),
      storage: editor.storage,
      terrain,
      terraform: {
        maxDeviationM: project.parameters.terraform.maxDeviationM,
        rootZonePerDbhCm: project.parameters.treeProtection.rootZonePerDbhCm,
      },
    });
    setSession(opened);
    return opened.dispose;
  }, [design, project, user, editor, terrain]);
  return session;
}

export function useManifest(): AssetManifest | undefined {
  const [manifest, setManifest] = useState<AssetManifest | undefined>(undefined);
  useEffect(() => {
    fetch(MODELS_INDEX)
      .then(async (response): Promise<unknown> => (response.ok ? response.json() : null))
      .then((json: unknown) => {
        setManifest(assetManifestFromModels(json, '/'));
      })
      .catch(() => {
        // Without the index every item draws as its placeholder shape.
      });
  }, []);
  return manifest;
}

/** The live metrics report plus the "Show me" actions that frame a problem in the scene. */
function useMeters(
  ctx: EditorContext | null,
  props: EditorWorkspaceProps,
  canvas: { current: CanvasApi | null },
) {
  const { project } = props;
  const parcel = useMemo(() => parcelSchema.parse(project.parcel), [project]);
  const parameters = useMemo(() => {
    const parsed = projectParametersSchema.safeParse(project.parameters);
    return parsed.success ? parsed.data : null;
  }, [project]);
  const baseline = useMemo(() => {
    const parsed = designDocumentSchema.safeParse(props.baseline?.document);
    return parsed.success ? parsed.data : undefined;
  }, [props.baseline]);
  const client = useMemo(() => createMetricsClient({ debounceMs: METRICS_DEBOUNCE_MS }), []);
  useEffect(
    () => () => {
      client.dispose();
    },
    [client],
  );
  const report = useLiveMetrics({ ctx, parcel, parameters, client, baseline });
  const targetOf = (key: ConstraintKey) =>
    ctx === null || report === null
      ? null
      : frameTargetForConstraint(key, {
          document: ctx.store.getState().document,
          zones: ctx.zones,
          report,
        });
  return {
    report,
    onShowMe: (key: ConstraintKey) => {
      const target = targetOf(key);
      if (target !== null) canvas.current?.frameOn(target);
    },
    canShow: (key: ConstraintKey) => targetOf(key) !== null,
  };
}

/** Exposes the editor state on window in test builds, for Playwright. */
function useTestHook(
  ctx: EditorContext | null,
  editor: EditorDeps,
  canvas: { current: CanvasApi | null },
): void {
  useEffect(() => {
    if (ctx === null || editor.testHook !== 'on') return undefined;
    return installTestHook(ctx.store, canvas);
  }, [ctx, editor.testHook, canvas]);
}

/** Tracks when the canvas is ready and sets the ready mark; returns the canvas callback. */
function useReadyMark(report: MetricsReport | null): () => void {
  const [scene, setScene] = useState<SceneReadiness>('loading');
  const onSceneReady = useCallback(() => {
    setScene('ready');
  }, []);
  useEditorReadyMark({ scene, report });
  return onSceneReady;
}

/**
 * The one selected item for the brief panel. The snapshot is a key string so the store's other
 * changes, such as a drag frame, do not re-render the panel.
 */
function useBriefSelection(store: EditorContext['store']): BriefSelection | null {
  const key = useSyncExternalStore(store.subscribe, () =>
    JSON.stringify(selectedForBrief(store.getState())),
  );
  return useMemo(() => JSON.parse(key) as BriefSelection | null, [key]);
}

/** The right column: the staff brief, closed at first, the selection note, then the meters. */
function EditorDetails(props: {
  readonly project: Project;
  readonly store: EditorContext['store'];
  readonly meters: ReturnType<typeof useMeters>;
}) {
  const { meters } = props;
  const selected = useBriefSelection(props.store);
  return (
    <>
      <BriefPanel brief={props.project.parameters.brief} selected={selected} />
      <MetersPanel
        report={meters.report}
        strings={metersStrings}
        onShowMe={meters.onShowMe}
        canShow={meters.canShow}
      />
    </>
  );
}

/** The editor with its bar: session, autosave, submit and the test hook for Playwright. */
/** Which optional tools the editor offers, the tier a test build pins, and the no-WebGL2 link. */
function sceneOptions(editor: EditorDeps, projectId: string) {
  return {
    features: { terraform: editor.terraform },
    tier: sceneTierFor(editor.testHook),
    webGlMissing: <WebGlMissingNotice projectId={projectId} />,
  };
}

/** The bar above the editor stage: the design name, save status, and the submit action. */
function EditorTopBar(props: {
  readonly name: string;
  readonly store: EditorContext['store'];
  readonly saves: DraftSaves;
  readonly closed: boolean;
  readonly signInHref: string;
  readonly report: MetricsReport | null;
  readonly openDialog: () => void;
}) {
  const { saves, report, openDialog } = props;
  return (
    <EditorBar
      heading={format(messages.editor.heading, { name: props.name })}
      store={props.store}
      status={saves.status}
      conflict={
        saves.conflict === null ? null : { onKeep: saves.keepMine, onUseSaved: saves.useSaved }
      }
      refusal={null}
      submitting="idle"
      closed={props.closed}
      signInHref={props.signInHref}
      onSubmit={() => {
        pressSubmit(report, openDialog);
      }}
    />
  );
}

/** A closed project is read-only: no autosave runs, so nothing is stored and nothing is claimed. */
function useWorkspaceSaves(session: EditorSession | null, props: EditorWorkspaceProps) {
  return useAutosave({ session, api: props.deps.api, design: props.design });
}

export function EditorWorkspace(props: EditorWorkspaceProps) {
  const { editor } = props.deps;
  const session = useEditorContext(props, editor);
  const ctx = session?.ctx ?? null;
  const closed = props.project.phase === 'closed';
  const saves = useWorkspaceSaves(closed ? null : session, props);
  const manifest = useManifest();
  const dialog = useSubmitDialog(ctx, props, manifest, saves);
  const canvas = useRef<CanvasApi | null>(null);
  const meters = useMeters(ctx, props, canvas);
  const onSceneReady = useReadyMark(meters.report);
  useTestHook(ctx, editor, canvas);
  const siteContext = useEditorSiteContext(props.deps.api, props.project, editor.storage.local);
  const walk = useEditorWalk(props.design, props.project);
  if (ctx === null) return null;
  const signInHref = loginRedirect(PATHS.design(props.project.id, props.design.id));
  return (
    <div className="web-editor">
      <EditorTopBar
        name={props.project.name}
        store={ctx.store}
        saves={saves}
        closed={closed}
        signInHref={signInHref}
        report={meters.report}
        openDialog={() => {
          dialog.setOpen(true);
        }}
      />
      <div className="web-editor__stage">
        <Suspense fallback={<p className="web-empty">{strings.viewer.loadingMessage}</p>}>
          <ParkEditor
            ctx={ctx}
            strings={strings}
            manifest={manifest}
            {...sceneOptions(editor, props.project.id)}
            report={meters.report}
            details={<EditorDetails project={props.project} store={ctx.store} meters={meters} />}
            onCanvasApi={(api) => {
              canvas.current = api;
            }}
            onSceneReady={onSceneReady}
            siteContext={siteContext}
            walk={walk}
          />
        </Suspense>
      </div>
      {dialog.open ? (
        <SubmitDialog
          onSubmit={dialog.runSubmit}
          onSuccess={dialog.onSuccess}
          onClose={() => {
            dialog.setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
