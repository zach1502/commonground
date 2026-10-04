import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouteLoaderData } from 'react-router';

import { screenSize, type EditorContext } from '@parkshape/scene/editor';

import type { User } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { useViewportWidth } from '../editor/use-viewport-width';
import { messages } from '../messages';
import { ROOT_ROUTE_ID } from '../shell/app-shell';

import { proposedBaseline } from './baseline';
import { BaselineEditor } from './baseline-editor';
import { parcelFrom } from './publish';
import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import { stepHref } from './wizard-steps';

const strings = messages.planner.refine;
const publishStrings = messages.planner.publish;

/** Step 5: refine the proposed baseline in the editor, with the staff lock and zone tools. */
export function RefineStep({ deps }: { readonly deps: Pick<WebDeps, 'editor'> }) {
  const { state, update } = useWizard();
  const navigate = useNavigate();
  const width = useViewportWidth();
  const user = useRouteLoaderData<{ user: User | null }>(ROOT_ROUTE_ID)?.user ?? null;
  const ctx = useRef<EditorContext | null>(null);
  const onContext = useCallback((next: EditorContext | null) => {
    ctx.current = next;
  }, []);
  const { features, locks, baseline, parameters } = state;
  // Read once per visit: the editor keeps its own copy, and Continue writes it back.
  const [document] = useState(() => baseline ?? proposedBaseline(features?.features ?? [], locks));
  const parcel = useMemo(
    () =>
      features === null
        ? null
        : parcelFrom(features, features.parkName ?? publishStrings.drawnSite),
    [features],
  );
  const zones = useMemo(() => parameters?.forbiddenZones ?? [], [parameters]);
  const onContinue = () => {
    update({ baseline: ctx.current?.store.getState().document ?? document });
    void navigate(stepHref('publish'));
  };
  const small = screenSize(width) === 'small';
  return (
    <StepFrame
      step="refine"
      actions="pinned"
      primary={{ label: messages.planner.wizard.continue, onPress: onContinue }}
    >
      {small || parcel === null ? (
        <p className="web-wizard__note">{strings.desktopOnly}</p>
      ) : (
        <BaselineEditor
          editor={deps.editor}
          userId={user?.id ?? 'staff'}
          document={document}
          parcel={parcel}
          zones={zones}
          onContext={onContext}
        />
      )}
    </StepFrame>
  );
}
