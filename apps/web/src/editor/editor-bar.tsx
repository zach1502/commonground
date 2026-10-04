import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { FADE, usePresence, type EditorStore, type Shown } from '@parkshape/scene/editor';
import { Button, InlineAlert } from '@parkshape/ui';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';

import type { SaveStatus } from './autosave';
import { DraftConflict, type DraftConflictChoice } from './draft-conflict';

export interface EditorBarProps {
  readonly heading: string;
  readonly store: EditorStore;
  readonly status: SaveStatus;
  readonly refusal: string | null;
  readonly submitting: 'idle' | 'submitting';
  readonly onSubmit: () => void;
  /** The reader's two ways out of a save conflict; null when there is none. */
  readonly conflict: DraftConflictChoice | null;
  /** True when the project is closed: the workspace is read-only, so Submit is not offered. */
  readonly closed: boolean;
  /** Where the sign-in link goes after a 401, carrying a returnTo back to this editor. */
  readonly signInHref: string;
}

const PLAIN_STATUS = ['saved', 'pending', 'saving', 'paused'] as const;
type PlainStatus = (typeof PLAIN_STATUS)[number];
const isPlainStatus = (status: SaveStatus): status is PlainStatus =>
  (PLAIN_STATUS as readonly SaveStatus[]).includes(status);

/**
 * The failed-save alert is up from a failure until a save succeeds, so it stays through the
 * retry while the status is pending or saving. No timer ever takes it down.
 */
function useFailedSave(status: SaveStatus): Shown {
  const [held, setHeld] = useState<Shown>(status === 'failed' ? 'shown' : 'hidden');
  const retrying = status === 'pending' || status === 'saving';
  const next: Shown = status === 'failed' || (retrying && held === 'shown') ? 'shown' : 'hidden';
  if (next !== held) setHeld(next);
  return next;
}

/** Fades in when a save fails and fades out after the save that succeeds; one alert per failure. */
function FailedSaveAlert({ status }: { readonly status: SaveStatus }) {
  const shown = useFailedSave(status);
  const presence = usePresence<HTMLDivElement>(shown, FADE, { onMount: 'enter' });
  if (presence.mounted === 'unmounted') return null;
  // While it fades out it is hidden from assistive tech, so a following alert stands alone.
  return (
    <div ref={presence.ref} {...presence.leaving}>
      <InlineAlert tone="danger" title={messages.editor.save.failed} />
    </div>
  );
}

/** The line under the design name: plain status text, or an alert for a refusal or conflict. */
function SaveLine({
  status,
  conflict,
  closed,
  signInHref,
}: Pick<EditorBarProps, 'status' | 'conflict' | 'closed' | 'signInHref'>) {
  const text = messages.editor;
  if (closed) {
    return <InlineAlert tone="danger" title={messages.failure.editingClosedProject} />;
  }
  const statusText = isPlainStatus(status) ? text.save[status] : null;
  return (
    <>
      <p role="status" className="web-editor__status" data-kind="data">
        {statusText}
      </p>
      <FailedSaveAlert status={status} />
      {status === 'signedOut' ? (
        <div className="web-editor__signed-out">
          <InlineAlert tone="danger" title={messages.failure.signedOut} />
          <Link to={signInHref}>{messages.failure.signIn}</Link>
        </div>
      ) : null}
      {status === 'conflict' && conflict !== null ? <DraftConflict {...conflict} /> : null}
    </>
  );
}

function HelpMenu({ store }: { readonly store: EditorStore }) {
  const [open, setOpen] = useState<'open' | 'closed'>('closed');
  const text = messages.editor;
  const choose = (act: () => void) => () => {
    act();
    setOpen('closed');
  };
  return (
    <div className="web-editor__help">
      <Button
        variant="tertiary"
        aria-expanded={open === 'open' ? 'true' : 'false'}
        aria-controls="editor-help"
        onPress={() => {
          setOpen(open === 'open' ? 'closed' : 'open');
        }}
      >
        {text.help}
      </Button>
      {open === 'open' ? (
        <ul id="editor-help" className="web-editor__menu">
          <li>
            <Button
              variant="tertiary"
              onPress={choose(() => {
                store.getState().setShortcuts('open');
              })}
            >
              {text.showShortcuts}
            </Button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** The bar above the editor: the design name, save status, Help and the one primary action. */
export function EditorBar(props: EditorBarProps): ReactNode {
  const text = messages.editor;
  return (
    <div className="web-editor__bar">
      <Link to={PATHS.home} className="web-editor__home" aria-label={messages.app.homeLink}>
        {messages.app.name}
      </Link>
      <h1 className="web-editor__title">{props.heading}</h1>
      <SaveLine
        status={props.status}
        conflict={props.conflict}
        closed={props.closed}
        signInHref={props.signInHref}
      />
      <HelpMenu store={props.store} />
      {props.closed ? null : (
        <div className="web-editor__submit">
          {props.refusal === null ? null : <InlineAlert tone="danger" title={props.refusal} />}
          <Button
            variant="primary"
            isPending={props.submitting === 'submitting'}
            onPress={props.onSubmit}
          >
            {text.submit}
          </Button>
        </div>
      )}
    </div>
  );
}
