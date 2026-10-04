import { useEffect, useMemo, useRef, useState } from 'react';

import { useRetryAfter } from '../../api/use-retry-after';
import type { CastVoteInput, WebApi } from '../../api/web-api';
import { format, messages } from '../../messages';

import { createVoteSender, type VoteSendStatus } from './vote-sender';

export interface VoteSending {
  readonly send: (input: CastVoteInput) => void;
  /** Resolves once every vote sent so far has been tried. */
  readonly settled: () => Promise<void>;
  /** Drops a failed vote for the design once a later change has replaced it. */
  readonly forget: (designId: string) => void;
  readonly status: VoteSendStatus;
  /** The too-many-votes wait copy while a 429 window is open, or null. */
  readonly rateLimitMessage: string | null;
  /** True while a rate-limit window keeps the vote buttons disabled. */
  readonly isBlocked: boolean;
}

/** One vote queue for the batch. A vote that failed goes again when the browser is back online. */
export function useVoteSender(
  api: Pick<WebApi, 'castVote'>,
  onRecorded: () => void = () => undefined,
): VoteSending {
  const [status, setStatus] = useState<VoteSendStatus>('sent');
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const retry = useRetryAfter();
  const { block } = retry;
  // Read through a ref, so a new callback each render never rebuilds the queue.
  const recorded = useRef(onRecorded);
  recorded.current = onRecorded;
  const sender = useMemo(
    () =>
      createVoteSender({
        castVote: async (input) => {
          const result = await api.castVote(input);
          recorded.current();
          return result;
        },
        onStatus: setStatus,
        onRateLimited: (seconds) => {
          setRateLimitMessage(format(messages.failure.tooManyVotes, { seconds }));
          block(seconds);
        },
      }),
    [api, block],
  );
  useEffect(() => {
    if (!retry.isBlocked) setRateLimitMessage(null);
  }, [retry.isBlocked]);
  useEffect(() => {
    const resend = () => {
      sender.retry();
    };
    window.addEventListener('online', resend);
    return () => {
      window.removeEventListener('online', resend);
    };
  }, [sender]);
  return {
    send: sender.send,
    settled: sender.settled,
    forget: sender.forget,
    status,
    rateLimitMessage,
    isBlocked: retry.isBlocked,
  };
}
