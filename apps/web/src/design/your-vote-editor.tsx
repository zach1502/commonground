import { useEffect, useId, useRef, useState } from 'react';

import { VOTE_COMMENT_MAX_CHARS } from '@parkshape/core';
import { Button, FieldTextArea, FieldWithHelp } from '@parkshape/ui';

import type { VoteReason } from '../api/web-api';
import type { VoteChoice, VoteDraft } from '../features/vote/use-vote-change';
import { REASON_IDS } from '../features/vote/vote-reasons';
import { format, messages } from '../messages';

const COMMENT_ROWS = 3;

const CHOICES = [
  { id: 'up', label: messages.vote.up },
  { id: 'down', label: messages.vote.down },
  { id: 'skip', label: messages.vote.skip },
] as const satisfies readonly { id: VoteChoice; label: string }[];

export interface YourVoteEditorProps {
  readonly initial: VoteDraft;
  /** True while a rate limit keeps the vote from being sent. */
  readonly isBlocked: boolean;
  readonly onSave: (draft: VoteDraft) => void;
  readonly onCancel: () => void;
  /** Shown as Withdraw vote when given, for a design the voter has a vote on. */
  readonly onWithdraw?: () => void;
}

function ChoiceButtons({
  choice,
  onPick,
}: {
  readonly choice: VoteChoice;
  readonly onPick: (next: VoteChoice) => void;
}) {
  return (
    <div role="group" aria-label={messages.voteChange.choiceLabel} className="web-vote-change__row">
      {CHOICES.map(({ id, label }) => (
        <Button
          key={id}
          variant="secondary"
          aria-pressed={choice === id ? 'true' : 'false'}
          held={choice === id ? 'held' : 'rest'}
          onPress={() => {
            onPick(id);
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function ReasonToggles({
  reasons,
  onToggle,
}: {
  readonly reasons: ReadonlySet<VoteReason>;
  readonly onToggle: (reason: VoteReason) => void;
}) {
  return (
    <fieldset className="web-vote-change__reasons">
      <legend>{messages.vote.reasonsHeading}</legend>
      <ul className="ps-reason-chips__list">
        {REASON_IDS.map((reason) => (
          <li key={reason}>
            <button
              type="button"
              aria-pressed={reasons.has(reason) ? 'true' : 'false'}
              className={reasons.has(reason) ? 'ps-chip ps-chip--on' : 'ps-chip'}
              onClick={() => {
                onToggle(reason);
              }}
            >
              {messages.vote.reasons[reason]}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function CommentBox({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}) {
  const id = useId();
  const text = messages.voteChange;
  return (
    <FieldWithHelp
      id={id}
      label={text.commentLabel}
      help={format(text.commentCount, { count: value.length, max: VOTE_COMMENT_MAX_CHARS })}
      size="long"
    >
      {(control) => (
        <FieldTextArea
          {...control}
          value={value}
          rows={COMMENT_ROWS}
          maxLength={VOTE_COMMENT_MAX_CHARS}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </FieldWithHelp>
  );
}

/** The voter's choice while the editor is open, with reasons kept in chip order. */
function useDraft(initial: VoteDraft) {
  const [choice, setChoice] = useState(initial.choice);
  const [reasons, setReasons] = useState<ReadonlySet<VoteReason>>(new Set(initial.reasons));
  const [comment, setComment] = useState(initial.comment);
  const toggle = (reason: VoteReason) => {
    const next = new Set(reasons);
    if (!next.delete(reason)) next.add(reason);
    setReasons(next);
  };
  const draft = (): VoteDraft =>
    choice === 'skip'
      ? { choice, reasons: [], comment: '' }
      : { choice, reasons: REASON_IDS.filter((id) => reasons.has(id)), comment: comment.trim() };
  return { choice, setChoice, reasons, toggle, comment, setComment, draft };
}

/**
 * Change for a vote already cast: up, down or Skip, the reason chips and a comment box with its
 * character count. The heading takes focus when it opens; Escape keeps the vote as it was.
 */
export function YourVoteEditor({
  initial,
  isBlocked,
  onSave,
  onCancel,
  onWithdraw,
}: YourVoteEditorProps) {
  const text = messages.voteChange;
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const state = useDraft(initial);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section
      className="web-vote-change"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <h3 id={headingId} ref={heading} tabIndex={-1} className="web-vote-change__heading">
        {text.heading}
      </h3>
      <ChoiceButtons choice={state.choice} onPick={state.setChoice} />
      {state.choice === 'skip' ? null : (
        <>
          <ReasonToggles reasons={state.reasons} onToggle={state.toggle} />
          <CommentBox value={state.comment} onChange={state.setComment} />
        </>
      )}
      <div className="web-vote-change__row">
        <Button
          isDisabled={isBlocked}
          onPress={() => {
            onSave(state.draft());
          }}
        >
          {text.save}
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          {text.keep}
        </Button>
        {onWithdraw === undefined ? null : (
          <Button variant="secondary" isDisabled={isBlocked} onPress={onWithdraw}>
            {text.withdraw}
          </Button>
        )}
      </div>
    </section>
  );
}
