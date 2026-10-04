import { useEffect, useRef, useState } from 'react';

import { failureCopyFor } from '../../api/error-copy';
import { useRetryAfter } from '../../api/use-retry-after';
import type { VoteReason, VoteValue, WebApi } from '../../api/web-api';

/** A vote as the server holds it for the voter. */
export interface StoredVote {
  readonly value: VoteValue;
  readonly reasons: readonly VoteReason[];
  readonly comment: string | null;
}

/** What the Change editor offers: a direction, or Skip, which withdraws the vote. */
export type VoteChoice = 'up' | 'down' | 'skip';

/** What the voter chose in the Change editor, before it is stored. */
export interface VoteDraft {
  readonly choice: VoteChoice;
  readonly reasons: readonly VoteReason[];
  readonly comment: string;
}

export type VoteChangeApi = Pick<WebApi, 'setMyVote' | 'withdrawMyVote'>;

/** The part of a set or a withdraw answer the caller reads: the design's counts after it. */
interface StoredResult {
  readonly design: { readonly up: number; readonly down: number };
}

/** 'idle' before a change or after one was rolled back by a rate limit, which has its own copy. */
export type VoteChangeStatus = 'idle' | 'saved' | 'withdrawn' | 'failed';

export interface VoteChangeInput {
  readonly api: VoteChangeApi;
  readonly designId: string;
  readonly initial: StoredVote | null;
  /** Waits for writes that must land first, such as the batch's own queued votes. */
  readonly before?: () => Promise<void>;
  /** Runs with the vote the voter now sees: at once, and again if the change rolls back. */
  readonly onShown?: (vote: StoredVote | null) => void;
  /** Runs once the server has the change, with its answer, which holds the design's counts. */
  readonly onStored?: (stored: StoredResult) => void;
}

export interface VoteChange {
  readonly vote: StoredVote | null;
  readonly editing: boolean;
  readonly status: VoteChangeStatus;
  /** The failure copy for the last change that did not go through, or null. */
  readonly failure: string | null;
  /** The too-many-votes copy while a 429 window is open, or null. */
  readonly waitMessage: string | null;
  readonly isBlocked: boolean;
  readonly open: () => void;
  readonly cancel: () => void;
  readonly save: (draft: VoteDraft) => void;
  readonly withdraw: () => void;
  /** Replaces the shown vote with one read from the server, with no write. */
  readonly reset: (vote: StoredVote | null) => void;
}

/** The editor's starting point for a stored vote; no vote opens on Skip. */
export function draftOf(vote: StoredVote | null): VoteDraft {
  if (vote === null) return { choice: 'skip', reasons: [], comment: '' };
  return {
    choice: vote.value === 1 ? 'up' : 'down',
    reasons: vote.reasons,
    comment: vote.comment ?? '',
  };
}

/** The vote a draft stores, or null for Skip; a blank comment is no comment. */
export function storedOf(draft: VoteDraft): StoredVote | null {
  if (draft.choice === 'skip') return null;
  const comment = draft.comment.trim();
  return {
    value: draft.choice === 'up' ? 1 : -1,
    reasons: draft.reasons,
    comment: comment === '' ? null : comment,
  };
}

function useFailure() {
  const [failure, setFailure] = useState<string | null>(null);
  const [waitMessage, setWaitMessage] = useState<string | null>(null);
  const retry = useRetryAfter();
  const shownWait = retry.isBlocked ? waitMessage : null;
  const clear = () => {
    setFailure(null);
    setWaitMessage(null);
  };
  /** Shows the failure copy; true when it was a rate limit, which blocks the buttons. */
  const show = (error: unknown): 'wait' | 'other' => {
    const copy = failureCopyFor(error, 'vote');
    if (copy.action !== 'wait') {
      setFailure(copy.message);
      return 'other';
    }
    setWaitMessage(copy.message);
    retry.block(copy.waitSeconds ?? 0);
    return 'wait';
  };
  return { failure, waitMessage: shownWait, isBlocked: retry.isBlocked, clear, show };
}

/**
 * The voter's own vote on one design, with Change and Withdraw vote. Each change shows at once
 * and goes to the server in order behind the ones before it; one that fails puts back the vote
 * the voter saw before it, with the failure copy for votes.
 */
export function useVoteChange(input: VoteChangeInput): VoteChange {
  const { api, designId } = input;
  const [vote, setVote] = useState<StoredVote | null>(input.initial);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<VoteChangeStatus>('idle');
  const failure = useFailure();
  const shown = useRef(vote);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const callbacks = useRef(input);
  callbacks.current = input;
  const show = (next: StoredVote | null, tell: 'tell' | 'quiet' = 'tell') => {
    shown.current = next;
    setVote(next);
    if (tell === 'tell') callbacks.current.onShown?.(next);
  };
  const apply = (next: StoredVote | null, write: () => Promise<StoredResult>) => {
    const previous = shown.current;
    show(next);
    setEditing(false);
    setStatus('idle');
    failure.clear();
    chain.current = chain.current.then(async () => {
      try {
        await callbacks.current.before?.();
        const stored = await write();
        setStatus(next === null ? 'withdrawn' : 'saved');
        callbacks.current.onStored?.(stored);
      } catch (error) {
        show(previous);
        setStatus(failure.show(error) === 'wait' ? 'idle' : 'failed');
      }
    });
  };
  const withdraw = () => {
    apply(null, () => api.withdrawMyVote(designId));
  };
  return {
    vote,
    editing,
    status,
    failure: failure.failure,
    waitMessage: failure.waitMessage,
    isBlocked: failure.isBlocked,
    open: () => {
      setEditing(true);
    },
    cancel: () => {
      setEditing(false);
    },
    save: (draft: VoteDraft) => {
      const next = storedOf(draft);
      if (next === null) withdraw();
      else apply(next, () => api.setMyVote({ designId, ...next }));
    },
    withdraw,
    reset: (next) => {
      show(next, 'quiet');
    },
  };
}

/**
 * When the editor closes, focus goes to the first of `ids` still on the page, such as Change,
 * or a heading once the vote is gone, so it never falls back to the page.
 */
export function useFocusAfterEditing(
  { editing }: Pick<VoteChange, 'editing'>,
  ids: readonly string[],
): void {
  const was = useRef(editing);
  const key = ids.join(' ');
  useEffect(() => {
    if (was.current && !editing) {
      const target = key
        .split(' ')
        .map((id) => document.getElementById(id))
        .find((element) => element !== null);
      target?.focus();
    }
    was.current = editing;
  }, [editing, key]);
}
