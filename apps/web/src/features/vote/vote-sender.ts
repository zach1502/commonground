import { ApiRequestError } from '@parkshape/api-client';

import type { CastVoteInput } from '../../api/web-api';

export type VoteSendStatus = 'sent' | 'failed';

export interface VoteSenderOptions {
  readonly castVote: (input: CastVoteInput) => Promise<unknown>;
  readonly onStatus: (status: VoteSendStatus) => void;
  /** Called when the server rate-limited a vote, with the Retry-After seconds it asked for. */
  readonly onRateLimited?: (retryAfterSeconds: number) => void;
}

export interface VoteSender {
  /** Queues the vote behind any still in flight, so a later reason update never lands first. */
  readonly send: (input: CastVoteInput) => void;
  /** Sends again the newest vote for each design whose last send failed. */
  readonly retry: () => void;
  /** Resolves once every vote queued so far has been tried, so a change made after lands last. */
  readonly settled: () => Promise<void>;
  /** Drops a failed vote for the design, once a later change has replaced it on the server. */
  readonly forget: (designId: string) => void;
}

interface Attempt {
  readonly input: CastVoteInput;
  readonly order: number;
}

const RATE_LIMITED = 429;

/**
 * Sends votes one at a time in the order they were cast. On a slow link the reasons from Next can
 * leave before the vote itself has arrived; queueing keeps the server's copy the newest one.
 */
export function createVoteSender({
  castVote,
  onStatus,
  onRateLimited,
}: VoteSenderOptions): VoteSender {
  let queue: Promise<void> = Promise.resolve();
  let order = 0;
  const confirmed = new Map<string, number>();
  const failed = new Map<string, Attempt>();

  const newerThan = (id: string, at: number) =>
    at > (failed.get(id)?.order ?? 0) && at > (confirmed.get(id) ?? 0);
  const arrived = ({ input, order: at }: Attempt) => {
    const id = input.designId;
    confirmed.set(id, Math.max(at, confirmed.get(id) ?? 0));
    if ((failed.get(id)?.order ?? 0) <= at) failed.delete(id);
  };
  const lost = (next: Attempt) => {
    if (newerThan(next.input.designId, next.order)) failed.set(next.input.designId, next);
  };
  const rateLimitSeconds = (error: unknown): number | null => {
    if (!(error instanceof ApiRequestError) || error.status !== RATE_LIMITED) return null;
    const body = error.body as { error?: { retryAfterSeconds?: number } } | undefined;
    return body?.error?.retryAfterSeconds ?? 0;
  };
  const attempt = async (next: Attempt): Promise<void> => {
    try {
      await castVote(next.input);
      arrived(next);
    } catch (error) {
      lost(next);
      const seconds = rateLimitSeconds(error);
      if (seconds !== null) onRateLimited?.(seconds);
    }
    onStatus(failed.size === 0 ? 'sent' : 'failed');
  };

  const enqueue = (next: Attempt) => {
    queue = queue.then(async () => attempt(next));
  };

  return {
    send: (input) => {
      order += 1;
      enqueue({ input, order });
    },
    retry: () => {
      [...failed.values()].forEach(enqueue);
    },
    settled: () => queue,
    forget: (designId) => {
      if (!failed.delete(designId)) return;
      onStatus(failed.size === 0 ? 'sent' : 'failed');
    },
  };
}
