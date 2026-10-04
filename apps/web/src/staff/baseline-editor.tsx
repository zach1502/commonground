import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  catalogIndex,
  createSeededRandom,
  type DesignDocument,
  type Parcel,
  type Zone,
} from '@parkshape/core';
import {
  lockStateOf,
  lockTargetOf,
  setElementLock,
  startZoneTool,
  HINTS_DISMISSED,
  type CanvasApi,
  type EditorContext,
  type LockTarget,
} from '@parkshape/scene/editor';
import { Button, LockToggle } from '@parkshape/ui';

import type { EditorDeps } from '../app-deps';
import { WebGlMissingNotice } from '../design/webgl-missing-notice';
import { openEditorSession } from '../editor/editor-session';
import { editorStrings } from '../editor/editor-strings';
import { useManifest } from '../editor/editor-workspace';
import { installTestHook } from '../editor/test-hook';
import { format, messages } from '../messages';

import { baselineStamp } from './baseline-stamp';
import { WIZARD_BASELINE_ID } from './wizard-state';

const ParkEditor = lazy(async () => ({ default: (await import('@parkshape/scene')).ParkEditor }));

const strings = messages.planner.refine;
const editorText = editorStrings();

export interface BaselineEditorProps {
  readonly editor: EditorDeps;
  readonly userId: string;
  readonly document: DesignDocument;
  readonly parcel: Parcel;
  readonly zones: readonly Zone[];
  /** Hands the live editor up, so Continue can read the refined document. */
  readonly onContext: (ctx: EditorContext | null) => void;
}

function useBaselineContext(props: BaselineEditorProps): EditorContext | null {
  const { editor, userId, document, parcel, zones, onContext } = props;
  const [ctx, setCtx] = useState<EditorContext | null>(null);
  useEffect(() => {
    const session = openEditorSession({
      designId: WIZARD_BASELINE_ID,
      userId,
      document,
      updatedAt: baselineStamp(document),
      whenServerMoved: 'take-server',
      parcel,
      zones,
      catalog: catalogIndex,
      random: createSeededRandom(editor.randomSeed),
      storage: editor.storage,
    });
    // Planners set up the park; the resident hints would only get in the way.
    session.ctx.store.getState().setHints(HINTS_DISMISSED);
    setCtx(session.ctx);
    onContext(session.ctx);
    return () => {
      onContext(null);
      session.dispose();
    };
  }, [editor, userId, document, parcel, zones, onContext]);
  return ctx;
}

function nameOf(state: ReturnType<EditorContext['store']['getState']>, target: LockTarget): string {
  const list = target.kind === 'item' ? state.document.items : state.document.areas;
  const catalogId = list.find((element) => element.id === target.id)?.catalogId;
  return (catalogId === undefined ? undefined : catalogIndex.get(catalogId)?.name) ?? target.id;
}

function useEditorState(ctx: EditorContext) {
  return useSyncExternalStore(ctx.store.subscribe, ctx.store.getState);
}

/** Staff-only tools in the editor's right panel: lock the selected item, and draw closed zones. */
function StaffTools({ ctx }: { readonly ctx: EditorContext }) {
  const state = useEditorState(ctx);
  const [last, setLast] = useState<LockTarget | null>(null);
  const target = lockTargetOf(state) ?? last;
  const lock = target === null ? null : lockStateOf(state, target);
  const zoneCount = state.document.zones.length;
  const startZone = (kind: Zone['kind']) => {
    startZoneTool(ctx, { kind, label: format(strings.zoneLabel[kind], { n: zoneCount + 1 }) });
  };
  return (
    <section className="web-wizard__tools" aria-labelledby="wizard-staff-tools">
      <h2 id="wizard-staff-tools" className="web-wizard__tools-heading">
        {strings.staffTools}
      </h2>
      <div className="web-wizard__tools-row">
        {target === null || lock === null ? null : (
          <LockToggle
            state={lock}
            label={format(strings.lockLabel, { name: nameOf(state, target) })}
            text={strings.lockSwitch}
            onChange={(next) => {
              setLast(target);
              setElementLock(ctx, target, next);
            }}
          />
        )}
        <Button
          variant="secondary"
          size="small"
          onPress={() => {
            startZone('forbidden');
          }}
        >
          {strings.forbidden}
        </Button>
        <Button
          variant="secondary"
          size="small"
          onPress={() => {
            startZone('noGrade');
          }}
        >
          {strings.noGrade}
        </Button>
      </div>
      <p role="status" className="web-wizard__note">
        {state.tool.kind === 'zone' ? strings.drawing : format(strings.zones, { count: zoneCount })}
      </p>
    </section>
  );
}

/** Step 5's editor: the resident editor on the proposed baseline, with the staff tools on the right. */
export function BaselineEditor(props: BaselineEditorProps) {
  const ctx = useBaselineContext(props);
  const manifest = useManifest();
  const canvas = useRef<CanvasApi | null>(null);
  const { testHook } = props.editor;
  useEffect(() => {
    if (ctx === null || testHook !== 'on') return undefined;
    return installTestHook(ctx.store, canvas);
  }, [ctx, testHook]);
  if (ctx === null) return null;
  return (
    <div className="web-wizard__editor">
      <div className="web-wizard__stage">
        <Suspense fallback={<p className="web-empty">{editorText.viewer.loadingMessage}</p>}>
          <ParkEditor
            ctx={ctx}
            strings={editorText}
            manifest={manifest}
            features={{ terraform: 'off' }}
            details={<StaffTools ctx={ctx} />}
            webGlMissing={
              <>
                <WebGlMissingNotice />
                <p>{strings.webGlSkip}</p>
              </>
            }
            onCanvasApi={(api) => {
              canvas.current = api;
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
