import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';

import { COMMENT_KINDS, ELEMENT_COMMENT_MAX_CHARS, type CommentKind } from '@parkshape/core';
import { Button, ButtonLink, classNames } from '@parkshape/ui';

import { format, messages } from '../../messages';

import { kindLabel } from './comment-list';
import type { ReviewComment } from './review-api';

/** What the composer sends; the page adds the element and the tap point. */
export interface CommentDraft {
  readonly kind: CommentKind;
  readonly text: string;
}

/** 'sent' clears the form; a failure keeps it and shows the message in the one alert. */
export type SendResult =
  { readonly kind: 'sent' } | { readonly kind: 'failed'; readonly message: string };

/** The form for a signed-in resident while open, a sign-in link, or the closed line. */
export type ComposerAccess =
  | { readonly kind: 'form' }
  | { readonly kind: 'sign-in'; readonly href: string }
  | { readonly kind: 'closed'; readonly line: string };

export interface CommentComposerProps {
  /** The element's label, such as "Bench, south-west"; it heads the composer. */
  readonly label: string;
  readonly access: ComposerAccess;
  /** Your own comment loaded for editing, or undefined for a new one. */
  readonly editing: ReviewComment | undefined;
  readonly onSend: (draft: CommentDraft) => Promise<SendResult>;
  readonly onCancel: () => void;
  /** The polite line after a send, such as "Comment added on Bench, south-west". */
  readonly status: string;
  /** The element's comments, under the form. */
  readonly children?: ReactNode;
}

interface KindChipsProps {
  readonly name: string;
  readonly kind: CommentKind | undefined;
  readonly onPick: (kind: CommentKind) => void;
}

/** The five kinds as native radios drawn as chips: one tab stop, arrow keys, one choice. */
function KindChips({ name, kind, onPick }: KindChipsProps) {
  return (
    <fieldset className="web-review__kinds">
      <legend className="web-review__legend">{messages.review.composer.legend}</legend>
      {COMMENT_KINDS.map((option) => (
        <label key={option} className={classNames('ps-chip', option === kind && 'ps-chip--on')}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={option === kind}
            className="web-review__kind-input"
            onChange={() => {
              onPick(option);
            }}
          />
          {kindLabel(option)}
        </label>
      ))}
    </fieldset>
  );
}

function useDraft(editing: ReviewComment | undefined) {
  const [kind, setKind] = useState<CommentKind | undefined>(editing?.kind);
  const [text, setText] = useState(editing?.text ?? '');
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState<'idle' | 'sending'>('idle');
  const note = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing === undefined) return;
    setKind(editing.kind);
    setText(editing.text);
    setAlert(null);
    note.current?.focus();
  }, [editing]);
  return { kind, setKind, text, setText, alert, setAlert, pending, setPending, note };
}

type Draft = ReturnType<typeof useDraft>;

async function send(draft: Draft, onSend: CommentComposerProps['onSend']): Promise<void> {
  if (draft.kind === undefined) {
    draft.setAlert(messages.review.composer.kindMissing);
    return;
  }
  draft.setPending('sending');
  const result = await onSend({ kind: draft.kind, text: draft.text.trim() });
  draft.setPending('idle');
  if (result.kind === 'failed') {
    draft.setAlert(result.message);
    return;
  }
  draft.setAlert(null);
  draft.setKind(undefined);
  draft.setText('');
}

function CommentForm(props: CommentComposerProps) {
  const text = messages.review.composer;
  const ids = { kinds: useId(), note: useId(), count: useId(), privacy: useId() };
  const draft = useDraft(props.editing);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft, props.onSend);
  };
  return (
    <form className="web-review__form" onSubmit={onSubmit} noValidate>
      <KindChips name={ids.kinds} kind={draft.kind} onPick={draft.setKind} />
      <label htmlFor={ids.note} className="web-review__note-label">
        {text.text}
      </label>
      <textarea
        ref={draft.note}
        id={ids.note}
        className="web-review__note"
        rows={3}
        maxLength={ELEMENT_COMMENT_MAX_CHARS}
        value={draft.text}
        aria-describedby={`${ids.count} ${ids.privacy}`}
        onChange={(event) => {
          draft.setText(event.target.value);
        }}
      />
      <p id={ids.count} className="web-review__count">
        {format(text.count, { count: draft.text.length, max: ELEMENT_COMMENT_MAX_CHARS })}
      </p>
      <p id={ids.privacy} className="web-review__privacy">
        {text.privacy}
      </p>
      {draft.alert === null ? null : (
        <p role="alert" className="web-review__alert">
          {draft.alert}
        </p>
      )}
      <div className="ps-inline ps-gap--small">
        <Button type="submit" isPending={draft.pending === 'sending'}>
          {props.editing === undefined ? text.add : text.save}
        </Button>
        <Button variant="tertiary" onPress={props.onCancel}>
          {text.cancel}
        </Button>
      </div>
    </form>
  );
}

function AccessBody(props: CommentComposerProps) {
  const { access } = props;
  if (access.kind === 'form') return <CommentForm {...props} />;
  if (access.kind === 'closed') return <p className="web-review__closed">{access.line}</p>;
  return (
    <ButtonLink href={access.href} variant="secondary">
      {messages.review.composer.signIn}
    </ButtonLink>
  );
}

/**
 * The composer for one element, in the sidebar: a labelled region, not a dialog. Its heading
 * takes focus when it opens; Escape or Cancel closes it.
 */
export function CommentComposer(props: CommentComposerProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [props.label]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    props.onCancel();
  };
  return (
    <section aria-labelledby={headingId} className="web-review__composer" onKeyDown={onKeyDown}>
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="web-review__heading"
        data-kind="data"
      >
        {props.label}
      </h2>
      <AccessBody {...props} />
      <p role="status" className="web-review__status">
        {props.status}
      </p>
      {props.children}
    </section>
  );
}
