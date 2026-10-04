import { useEffect, useId, useRef } from 'react';

import { Button, InlineAlert, Stack } from '@parkshape/ui';

import type { Design, User, VoteValue, WebApi } from '../api/web-api';
import {
  draftOf,
  useFocusAfterEditing,
  useVoteChange,
  type VoteChange,
  type VoteChangeStatus,
} from '../features/vote/use-vote-change';
import { messages } from '../messages';

import { YourVoteEditor } from './your-vote-editor';

type VoteApi = Pick<WebApi, 'getMyVote' | 'setMyVote' | 'withdrawMyVote'>;

export interface YourVoteProps {
  readonly api: VoteApi;
  readonly design: Design;
  readonly user: User | null;
  /** Runs with the design's up and down counts once the server has each change. */
  readonly onCounts?: (counts: { readonly up: number; readonly down: number }) => void;
  /** 'review' when Review this design is the page's one primary action; Vote up then steps down. */
  readonly emphasis?: 'vote' | 'review';
}

function canVoteOn(design: Design, user: User | null): boolean {
  if (user === null || design.status !== 'submitted') {
    return false;
  }
  return design.author?.id !== user.id;
}

/** Reads the caller's stored vote once, into the change state. */
interface StoredVoteRead {
  readonly api: VoteApi;
  readonly designId: string;
  readonly change: VoteChange;
  /** 'skip' for a visitor who cannot vote here, so nothing is read. */
  readonly read: 'read' | 'skip';
}

function useStoredVote({ api, designId, change, read }: StoredVoteRead) {
  const { reset } = change;
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (read === 'skip') return;
    let active = true;
    void api
      .getMyVote(designId)
      .then(({ vote }) => {
        if (!active || vote === null) return;
        resetRef.current({ value: vote.value, reasons: vote.reasons, comment: vote.comment });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, designId, read]);
}

// Vote up is the page's one filled button and Vote down stays secondary, whichever was cast.
const VOTE_CHOICES = [
  { value: 1, label: 'yourVoteUp', variant: 'primary' },
  { value: -1, label: 'yourVoteDown', variant: 'secondary' },
] as const satisfies readonly {
  value: VoteValue;
  label: keyof typeof messages.designPage;
  variant: 'primary' | 'secondary';
}[];

function statusLine(status: VoteChangeStatus, change: VoteChange): string {
  const text = messages.designPage;
  if (status === 'failed') return change.failure ?? '';
  if (status === 'saved') return text.yourVoteSaved;
  if (status === 'withdrawn') return messages.voteChange.withdrawn;
  if (change.vote === null) return '';
  return change.vote.value === 1 ? text.yourVoteUpCurrent : text.yourVoteDownCurrent;
}

/** Vote up and Vote down; a press keeps the stored reasons and comment. */
function QuickVote({
  change,
  emphasis,
}: {
  readonly change: VoteChange;
  readonly emphasis: 'vote' | 'review';
}) {
  const current = draftOf(change.vote);
  return (
    <div className="ps-inline ps-gap--small">
      {VOTE_CHOICES.map(({ value, label, variant }) => (
        <Button
          key={label}
          variant={emphasis === 'review' ? 'secondary' : variant}
          isDisabled={change.isBlocked}
          aria-pressed={change.vote?.value === value ? 'true' : 'false'}
          onPress={() => {
            change.save({ ...current, choice: value === 1 ? 'up' : 'down' });
          }}
        >
          {messages.designPage[label]}
        </Button>
      ))}
    </div>
  );
}

function ChangeActions({
  change,
  changeId,
}: {
  readonly change: VoteChange;
  readonly changeId: string;
}) {
  if (change.vote === null) return null;
  const text = messages.voteChange;
  return (
    <div className="ps-inline ps-gap--small">
      <Button id={changeId} variant="secondary" onPress={change.open}>
        {text.change}
      </Button>
      <Button variant="tertiary" isDisabled={change.isBlocked} onPress={change.withdraw}>
        {text.withdraw}
      </Button>
    </div>
  );
}

/**
 * Lets a signed-in resident set, change or withdraw their vote on a live design they did not
 * write. The button for the vote they cast is pressed and the line under the buttons names it;
 * Change opens the direction, the reasons and a comment, and Withdraw vote removes the vote.
 */
export function YourVote({ api, design, user, onCounts, emphasis = 'vote' }: YourVoteProps) {
  const allowed = canVoteOn(design, user);
  const change = useVoteChange({
    api,
    designId: design.id,
    initial: null,
    ...(onCounts === undefined
      ? {}
      : {
          onStored: ({ design: counts }) => {
            onCounts({ up: counts.up, down: counts.down });
          },
        }),
  });
  useStoredVote({ api, designId: design.id, change, read: allowed ? 'read' : 'skip' });
  const ids = { change: useId(), heading: useId() };
  useFocusAfterEditing(change, [ids.change, ids.heading]);
  if (!allowed) return null;
  return (
    <Stack gap="small" className="web-design__vote">
      <h2 id={ids.heading} tabIndex={-1} className="web-design__vote-heading">
        {messages.designPage.yourVoteHeading}
      </h2>
      {change.editing ? (
        <YourVoteEditor
          initial={draftOf(change.vote)}
          isBlocked={change.isBlocked}
          onSave={change.save}
          onCancel={change.cancel}
        />
      ) : (
        <>
          <QuickVote change={change} emphasis={emphasis} />
          <ChangeActions change={change} changeId={ids.change} />
        </>
      )}
      {change.waitMessage === null ? (
        <p role="status" className="web-design__vote-status">
          {statusLine(change.status, change)}
        </p>
      ) : (
        <InlineAlert tone="danger" title={change.waitMessage} />
      )}
    </Stack>
  );
}
