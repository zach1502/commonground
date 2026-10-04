import { describe, expect, it, vi } from 'vitest';

import type { CastVoteInput } from '../../api/web-api';

import { createVoteSender } from './vote-sender';

const UP: CastVoteInput = { designId: 'a', value: 1, reasons: [] };
const UP_TREES: CastVoteInput = { designId: 'a', value: 1, reasons: ['trees'] };

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createVoteSender', () => {
  it('sends the reasons only after the vote itself has arrived', async () => {
    const first = deferred();
    const castVote = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const sender = createVoteSender({ castVote, onStatus: vi.fn() });
    sender.send(UP);
    sender.send(UP_TREES);
    await settle();
    expect(castVote).toHaveBeenCalledOnce();
    first.resolve();
    await settle();
    expect(castVote).toHaveBeenLastCalledWith(UP_TREES);
    expect(castVote).toHaveBeenCalledTimes(2);
  });

  it('reports a failed send and keeps the vote for a retry', async () => {
    const castVote = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const sender = createVoteSender({ castVote, onStatus });
    sender.send(UP);
    await settle();
    expect(onStatus).toHaveBeenLastCalledWith('failed');
    sender.retry();
    await settle();
    expect(castVote).toHaveBeenLastCalledWith(UP);
    expect(onStatus).toHaveBeenLastCalledWith('sent');
  });

  it('retries only the newest vote for a design', async () => {
    const castVote = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const sender = createVoteSender({ castVote, onStatus: vi.fn() });
    sender.send(UP);
    sender.send(UP_TREES);
    await settle();
    sender.retry();
    await settle();
    expect(castVote).toHaveBeenCalledTimes(3);
    expect(castVote).toHaveBeenLastCalledWith(UP_TREES);
  });

  it('does nothing on retry when every vote has arrived', async () => {
    const castVote = vi.fn().mockResolvedValue(undefined);
    const sender = createVoteSender({ castVote, onStatus: vi.fn() });
    sender.send(UP);
    await settle();
    sender.retry();
    await settle();
    expect(castVote).toHaveBeenCalledOnce();
  });
});

describe('createVoteSender with later changes', () => {
  it('settles only once every vote queued before it has been tried', async () => {
    const first = deferred();
    const castVote = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const sender = createVoteSender({ castVote, onStatus: vi.fn() });
    sender.send(UP);
    const settled = vi.fn();
    void sender.settled().then(settled);
    await settle();
    expect(settled).not.toHaveBeenCalled();
    first.resolve();
    await settle();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('forgets a failed vote for a design, so a later retry cannot undo a change made since', async () => {
    const castVote = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const sender = createVoteSender({ castVote, onStatus });
    sender.send(UP);
    await settle();
    expect(onStatus).toHaveBeenLastCalledWith('failed');
    sender.forget('a');
    expect(onStatus).toHaveBeenLastCalledWith('sent');
    sender.retry();
    await settle();
    expect(castVote).toHaveBeenCalledOnce();
  });
});
