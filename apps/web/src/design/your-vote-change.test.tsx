import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import type { Design, User } from '../api/web-api';
import { messages } from '../messages';

import { YourVote, type YourVoteProps } from './your-vote';

const text = messages.designPage;
const change = messages.voteChange;
const voter: User = { id: 'u2', displayName: 'Sam Lee', role: 'resident' };
const DESIGN = {
  id: 'd1',
  status: 'submitted',
  author: { id: 'u1', displayName: 'Molly Swingset' },
} as unknown as Design;
const STORED = { value: 1, reasons: ['trees', 'water'], comment: 'Good shade.' } as const;
const RATE_LIMITED = new ApiRequestError(429, 'rate-limited', 'slow', {
  error: { kind: 'rate-limited', message: 'slow', retryAfterSeconds: 20 },
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function renderVote(overrides: Partial<YourVoteProps['api']> = {}) {
  const api: YourVoteProps['api'] = {
    getMyVote: vi.fn().mockResolvedValue({ vote: STORED }),
    setMyVote: vi.fn().mockResolvedValue({}),
    withdrawMyVote: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  render(<YourVote api={api} design={DESIGN} user={voter} />);
  return api;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

describe('YourVote Change', () => {
  it('opens the stored reasons and comment, and saves the edit with them', async () => {
    const api = renderVote();
    const person = user();
    await person.click(await screen.findByRole('button', { name: change.change }));
    const box = screen.getByRole('textbox', { name: change.commentLabel });
    expect(box).toHaveValue('Good shade.');
    await person.type(box, ' And benches.');
    await person.click(screen.getByRole('button', { name: messages.vote.reasons.water }));
    await person.click(screen.getByRole('button', { name: change.save }));
    expect(api.setMyVote).toHaveBeenCalledExactlyOnceWith({
      designId: 'd1',
      value: 1,
      reasons: ['trees'],
      comment: 'Good shade. And benches.',
    });
    expect(await screen.findByText(text.yourVoteSaved)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: change.change })).toHaveFocus();
  });

  it('keeps the stored reasons and comment when a vote button changes direction', async () => {
    const api = renderVote();
    await user().click(await screen.findByRole('button', { name: text.yourVoteDown }));
    expect(api.setMyVote).toHaveBeenCalledWith({
      designId: 'd1',
      value: -1,
      reasons: ['trees', 'water'],
      comment: 'Good shade.',
    });
  });

  it('shows the change at once and rolls it back with the failure copy when it fails', async () => {
    const pending = deferred<never>();
    renderVote({ setMyVote: vi.fn().mockReturnValue(pending.promise) });
    const person = user();
    await person.click(await screen.findByRole('button', { name: change.change }));
    await person.click(screen.getByRole('button', { name: messages.vote.down }));
    await person.click(screen.getByRole('button', { name: change.save }));
    expect(screen.getByRole('button', { name: text.yourVoteDown })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await act(async () => {
      pending.reject(new ApiRequestError(500, 'internal', 'boom'));
      await Promise.resolve();
    });
    expect(await screen.findByText(messages.failure.serverError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('YourVote Withdraw vote', () => {
  it('removes the vote at once and leaves the buttons to vote again', async () => {
    const api = renderVote();
    await user().click(await screen.findByRole('button', { name: change.withdraw }));
    expect(api.withdrawMyVote).toHaveBeenCalledExactlyOnceWith('d1');
    expect(await screen.findByText(change.withdrawn)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: change.withdraw })).toBeNull();
    expect(screen.queryByRole('button', { name: change.change })).toBeNull();
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('withdraws when Skip is saved in Change', async () => {
    const api = renderVote();
    const person = user();
    await person.click(await screen.findByRole('button', { name: change.change }));
    await person.click(screen.getByRole('button', { name: messages.vote.skip }));
    await person.click(screen.getByRole('button', { name: change.save }));
    expect(api.withdrawMyVote).toHaveBeenCalledExactlyOnceWith('d1');
    expect(api.setMyVote).not.toHaveBeenCalled();
  });

  it('puts the vote back and waits out a rate limit on the fake clock', async () => {
    renderVote({ withdrawMyVote: vi.fn().mockRejectedValue(RATE_LIMITED) });
    await user().click(await screen.findByRole('button', { name: change.withdraw }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You voted too many times just now. Try again in 20 seconds.');
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: change.withdraw })).toBeDisabled();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole('button', { name: change.withdraw })).toBeEnabled();
  });
});

describe('YourVote counts (owner check 9)', () => {
  it('reports the counts the server sends back after a vote, a change and a withdraw', async () => {
    const onCounts = vi.fn();
    const api: YourVoteProps['api'] = {
      getMyVote: vi.fn().mockResolvedValue({ vote: null }),
      setMyVote: vi
        .fn()
        .mockResolvedValueOnce({ design: { id: 'd1', up: 7, down: 5 } })
        .mockResolvedValueOnce({ design: { id: 'd1', up: 6, down: 6 } }),
      withdrawMyVote: vi.fn().mockResolvedValue({ design: { id: 'd1', up: 6, down: 5 } }),
    };
    render(<YourVote api={api} design={DESIGN} user={voter} onCounts={onCounts} />);
    const person = user();
    await person.click(await screen.findByRole('button', { name: text.yourVoteUp }));
    await waitFor(() => {
      expect(onCounts).toHaveBeenLastCalledWith({ up: 7, down: 5 });
    });
    await person.click(screen.getByRole('button', { name: text.yourVoteDown }));
    await waitFor(() => {
      expect(onCounts).toHaveBeenLastCalledWith({ up: 6, down: 6 });
    });
    await person.click(screen.getByRole('button', { name: change.withdraw }));
    await waitFor(() => {
      expect(onCounts).toHaveBeenLastCalledWith({ up: 6, down: 5 });
    });
    expect(onCounts).toHaveBeenCalledTimes(3);
  });
});
