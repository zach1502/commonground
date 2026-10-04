import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import type { Design, User, VoteValue } from '../api/web-api';
import { messages } from '../messages';

import { YourVote, type YourVoteProps } from './your-vote';

const text = messages.designPage;
const voter: User = { id: 'u2', displayName: 'Sam Lee', role: 'resident' };
const DESIGN = {
  id: 'd1',
  status: 'submitted',
  author: { id: 'u1', displayName: 'Molly Swingset' },
} as unknown as Design;

function voteOf(value: VoteValue | null, reasons: string[] = [], comment: string | null = null) {
  return { vote: value === null ? null : { value, reasons, comment } };
}

function fakeApi(overrides: Partial<YourVoteProps['api']> = {}): YourVoteProps['api'] {
  return {
    getMyVote: vi.fn().mockResolvedValue(voteOf(null)),
    setMyVote: vi.fn().mockResolvedValue({}),
    withdrawMyVote: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function renderVote(props: Partial<YourVoteProps> = {}) {
  const api = props.api ?? fakeApi();
  render(<YourVote api={api} design={DESIGN} user={voter} {...props} />);
  return api;
}

function pressed(name: string) {
  return screen.getByRole('button', { name }).getAttribute('data-variant');
}

describe('YourVote', () => {
  it('shows the vote buttons with no status line before a vote, Vote up filled', async () => {
    renderVote();
    expect(await screen.findByRole('status')).toBeEmptyDOMElement();
    expect(pressed(text.yourVoteUp)).toBe('primary');
    expect(pressed(text.yourVoteDown)).toBe('secondary');
    for (const name of [text.yourVoteUp, text.yourVoteDown]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('draws Vote up secondary when the page leads with Review this design', async () => {
    renderVote({ emphasis: 'review' });
    expect(await screen.findByRole('status')).toBeEmptyDOMElement();
    expect(pressed(text.yourVoteUp)).toBe('secondary');
    expect(pressed(text.yourVoteDown)).toBe('secondary');
  });

  it('keeps Vote down secondary after a down vote, marked as pressed', async () => {
    renderVote({ api: fakeApi({ getMyVote: vi.fn().mockResolvedValue(voteOf(-1)) }) });
    expect(await screen.findByText(text.yourVoteDownCurrent)).toBeInTheDocument();
    const down = screen.getByRole('button', { name: text.yourVoteDown });
    expect(down).toHaveAttribute('aria-pressed', 'true');
    expect(pressed(text.yourVoteDown)).toBe('secondary');
    expect(pressed(text.yourVoteUp)).toBe('primary');
  });

  it('shows an earlier up vote as the pressed, filled button', async () => {
    renderVote({ api: fakeApi({ getMyVote: vi.fn().mockResolvedValue(voteOf(1)) }) });
    expect(await screen.findByText(text.yourVoteUpCurrent)).toBeInTheDocument();
    expect(pressed(text.yourVoteUp)).toBe('primary');
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: text.yourVoteDown })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows an earlier down vote', async () => {
    renderVote({ api: fakeApi({ getMyVote: vi.fn().mockResolvedValue(voteOf(-1)) }) });
    expect(await screen.findByText(text.yourVoteDownCurrent)).toBeInTheDocument();
  });
});

describe('YourVote changes', () => {
  it('saves a vote up and marks the button', async () => {
    const api = renderVote();
    await userEvent.click(screen.getByRole('button', { name: text.yourVoteUp }));
    expect(await screen.findByText(text.yourVoteSaved)).toBeInTheDocument();
    expect(api.setMyVote).toHaveBeenCalledWith({
      designId: 'd1',
      value: 1,
      reasons: [],
      comment: null,
    });
    expect(pressed(text.yourVoteUp)).toBe('primary');
    expect(pressed(text.yourVoteDown)).toBe('secondary');
  });

  it('changes an up vote to a down vote', async () => {
    const api = renderVote({ api: fakeApi({ getMyVote: vi.fn().mockResolvedValue(voteOf(1)) }) });
    await screen.findByText(text.yourVoteUpCurrent);
    await userEvent.click(screen.getByRole('button', { name: text.yourVoteDown }));
    expect(await screen.findByText(text.yourVoteSaved)).toBeInTheDocument();
    expect(api.setMyVote).toHaveBeenLastCalledWith({
      designId: 'd1',
      value: -1,
      reasons: [],
      comment: null,
    });
    expect(screen.getByRole('button', { name: text.yourVoteDown })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(pressed(text.yourVoteDown)).toBe('secondary');
  });
});

describe('YourVote when a vote cannot be saved', () => {
  it('says the vote was not saved and keeps the earlier vote when saving fails', async () => {
    const api = fakeApi({
      getMyVote: vi.fn().mockResolvedValue(voteOf(1)),
      setMyVote: vi.fn().mockRejectedValue(new Error('offline')),
    });
    renderVote({ api });
    await screen.findByText(text.yourVoteUpCurrent);
    await userEvent.click(screen.getByRole('button', { name: text.yourVoteDown }));
    expect(await screen.findByText(messages.failure.serverError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(pressed(text.yourVoteDown)).toBe('secondary');
  });

  it('still offers the buttons when the earlier vote cannot be read', async () => {
    renderVote({ api: fakeApi({ getMyVote: vi.fn().mockRejectedValue(new Error('offline')) }) });
    expect(await screen.findByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toBeEnabled();
  });

  it('hides for a signed-out visitor, a draft and the author', () => {
    const api = fakeApi();
    const { rerender } = render(<YourVote api={api} design={DESIGN} user={null} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    const draft = { ...DESIGN, status: 'draft' } as unknown as Design;
    rerender(<YourVote api={api} design={draft} user={voter} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    rerender(<YourVote api={api} design={DESIGN} user={{ ...voter, id: 'u1' }} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(api.getMyVote).not.toHaveBeenCalled();
  });
});

describe('YourVote when the API rate limits the vote', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('states the fact, says when to try again, disables then re-enables on time', async () => {
    const rateLimit = new ApiRequestError(429, 'rate-limited', 'slow', {
      error: { kind: 'rate-limited', message: 'slow', retryAfterSeconds: 30 },
    });
    const api = fakeApi({ setMyVote: vi.fn().mockRejectedValue(rateLimit) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderVote({ api });
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: text.yourVoteUp }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You voted too many times just now. Try again in 30 seconds.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: text.yourVoteUp })).toBeDisabled();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('button', { name: text.yourVoteUp })).toBeEnabled();
  });
});
