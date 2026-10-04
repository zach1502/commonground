import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import type { DesignSummary, Project } from '../../api/web-api';
import { messages } from '../../messages';

import { VoteBatchView } from './vote-batch-view';

vi.mock('./vote-warm', () => ({ warmVoteModel: vi.fn(), loadVoteViewer: vi.fn() }));
vi.mock('./vote-model', () => {
  function StubModel() {
    return null;
  }
  return { VoteModel: StubModel };
});

const text = messages.vote;
const change = messages.voteChange;
const OPEN_PROJECT = { id: 'p', name: 'Park', phase: 'open', closesAt: null } as unknown as Project;
const CARDS = ['a', 'b', 'c'].map(
  (id) =>
    ({
      id,
      title: `Card ${id}`,
      thumbnailUrl: `/t/${id}.png`,
      badges: [],
      up: 0,
      down: 0,
    }) as unknown as DesignSummary,
);

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

function renderBatch(overrides: Record<string, unknown> = {}) {
  const api = {
    getDesign: vi.fn().mockReturnValue(new Promise(() => undefined)),
    getTerrain: vi.fn().mockReturnValue(new Promise(() => undefined)),
    getContext: vi.fn().mockReturnValue(new Promise(() => undefined)),
    castVote: vi.fn().mockResolvedValue(undefined),
    setMyVote: vi.fn().mockResolvedValue(undefined),
    withdrawMyVote: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const onVoteRecorded = vi.fn();
  const View = () => (
    <VoteBatchView
      api={api}
      project={OPEN_PROJECT}
      candidates={CARDS}
      baselineDesignId={null}
      onVoteMore={vi.fn()}
      onVoteRecorded={onVoteRecorded}
    />
  );
  const router = createMemoryRouter([{ path: '/', Component: View }]);
  render(<RouterProvider router={router} />);
  return { api, onVoteRecorded };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

/** Card a up with Trees, card b skipped, card c down. */
async function finishBatch() {
  const person = user();
  await person.click(screen.getByRole('button', { name: text.up }));
  await person.click(screen.getByRole('button', { name: text.reasons.trees }));
  await person.click(screen.getByRole('button', { name: text.reasonsNext }));
  await person.click(screen.getByRole('button', { name: text.skip }));
  await person.click(screen.getByRole('button', { name: text.down }));
  await person.click(screen.getByRole('button', { name: text.reasonsNext }));
  await screen.findByRole('heading', { level: 1, name: 'You voted on 2 designs' });
  return person;
}

const row = (title: string) => {
  const item = screen.getByRole('link', { name: title }).closest('li');
  if (item === null) throw new Error(`no result row for ${title}`);
  return within(item);
};

describe('changing a vote on the end of a batch', () => {
  it('offers Change on every row, named by its design', async () => {
    renderBatch();
    await finishBatch();
    const buttons = screen.getAllByRole('button', { name: change.change });
    expect(buttons).toHaveLength(CARDS.length);
    expect(buttons[0]).toHaveAccessibleDescription('Card a');
  });

  it('opens the vote as sent, and saves a new direction and comment after the sends settle', async () => {
    const first = deferred();
    const castVote = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const { api, onVoteRecorded } = renderBatch({ castVote });
    const person = await finishBatch();
    await person.click(row('Card a').getByRole('button', { name: change.change }));
    expect(screen.getByRole('button', { name: text.reasons.trees })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await person.click(screen.getByRole('button', { name: text.down }));
    await person.type(screen.getByRole('textbox', { name: change.commentLabel }), 'Less lawn.');
    await person.click(screen.getByRole('button', { name: change.save }));
    expect(row('Card a').getByText(text.resultDown)).toBeInTheDocument();
    expect(api.setMyVote).not.toHaveBeenCalled();
    await act(async () => {
      first.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.setMyVote).toHaveBeenCalledExactlyOnceWith({
      designId: 'a',
      value: -1,
      reasons: ['trees'],
      comment: 'Less lawn.',
    });
    expect(await screen.findByText(messages.designPage.yourVoteSaved)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You voted on 2 designs');
    expect(onVoteRecorded).toHaveBeenCalled();
  });
});

describe('withdrawing and rolling back on the end of a batch', () => {
  it('counts a skipped design once the voter votes on it, and drops a withdrawn one', async () => {
    const { api } = renderBatch();
    const person = await finishBatch();
    await person.click(row('Card b').getByRole('button', { name: change.change }));
    expect(screen.queryByRole('button', { name: change.withdraw })).toBeNull();
    await person.click(screen.getByRole('button', { name: text.up }));
    await person.click(screen.getByRole('button', { name: change.save }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You voted on 3 designs');
    await person.click(row('Card c').getByRole('button', { name: change.change }));
    await person.click(screen.getByRole('button', { name: change.withdraw }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You voted on 2 designs');
    expect(row('Card c').getByText(text.resultSkipped)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.withdrawMyVote).toHaveBeenCalledExactlyOnceWith('c');
    expect(await screen.findByText(change.withdrawn)).toBeInTheDocument();
  });

  it('rolls the row and the count back with the failure copy when the change fails', async () => {
    renderBatch({ withdrawMyVote: vi.fn().mockRejectedValue(new ApiRequestError(500, 'x', 'x')) });
    const person = await finishBatch();
    await person.click(row('Card a').getByRole('button', { name: change.change }));
    await person.click(screen.getByRole('button', { name: change.withdraw }));
    expect(await screen.findByText(messages.failure.serverError)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You voted on 2 designs');
    expect(row('Card a').getByText(text.resultUp)).toBeInTheDocument();
  });
});
