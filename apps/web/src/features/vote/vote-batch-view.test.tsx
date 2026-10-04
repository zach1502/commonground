import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Design, DesignSummary, Project } from '../../api/web-api';
import { format, messages } from '../../messages';

import { VoteBatchView } from './vote-batch-view';

// A swipe warms the 3D chunk; the stub keeps three.js out of jsdom.
vi.mock('./vote-warm', () => ({ warmVoteModel: vi.fn(), loadVoteViewer: vi.fn() }));
vi.mock('./vote-model', () => {
  function StubModel() {
    return null;
  }
  return { VoteModel: StubModel };
});

const PARCEL = {
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 20 },
  ],
  origin: { lat: 49.26, lon: -123.1 },
};
const PROJECT = {
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  phase: 'open',
  closesAt: null,
  parcel: PARCEL,
} as unknown as Project;
const DOCUMENT = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

function fullDesign(id: string, thumbnailUrl: string | null = null): Design {
  return { ...summary(id), thumbnailUrl, document: DOCUMENT } as unknown as Design;
}

function summary(id: string): DesignSummary {
  return {
    id,
    title: `Design ${id}`,
    thumbnailUrl: `/blobs/thumbnails/${id}.png`,
    badges: [],
    up: 0,
    down: 0,
  } as unknown as DesignSummary;
}

interface BatchOptions {
  readonly getDesign?: (id: string) => Promise<Design>;
  readonly baselineDesignId?: string | null;
}

function renderBatch(candidates: readonly DesignSummary[], options: BatchOptions = {}) {
  const castVote = vi.fn().mockResolvedValue(undefined);
  // A pending promise leaves the full design unloaded, as on a slow link.
  const getDesign = options.getDesign ?? vi.fn().mockReturnValue(new Promise(() => undefined));
  const onVoteMore = vi.fn();
  const getTerrain = vi.fn().mockReturnValue(new Promise(() => undefined));
  const getContext = vi.fn().mockReturnValue(new Promise(() => undefined));
  const api = {
    getDesign,
    castVote,
    getTerrain,
    getContext,
    setMyVote: vi.fn(),
    withdrawMyVote: vi.fn(),
  };
  const BatchRoute = () => (
    <VoteBatchView
      api={api}
      project={PROJECT}
      candidates={candidates}
      baselineDesignId={options.baselineDesignId ?? null}
      onVoteMore={onVoteMore}
      onVoteRecorded={vi.fn()}
    />
  );
  const router = createMemoryRouter([{ path: '/v', Component: BatchRoute }], {
    initialEntries: ['/v'],
  });
  render(<RouterProvider router={router} />);
  return { castVote, getDesign, onVoteMore };
}

/** A left-to-right or bottom-to-top drag on the picture, the way a finger swipes. */
function swipe(from: { x: number; y: number }, to: { x: number; y: number }) {
  const stage = screen.getByTestId('vote-stage');
  fireEvent(
    stage,
    new MouseEvent('pointerdown', { bubbles: true, clientX: from.x, clientY: from.y }),
  );
  fireEvent(stage, new MouseEvent('pointerup', { bubbles: true, clientX: to.x, clientY: to.y }));
}

const SWIPE_LEFT = [
  { x: 200, y: 100 },
  { x: 10, y: 100 },
] as const;
const SWIPE_UP = [
  { x: 100, y: 300 },
  { x: 100, y: 10 },
] as const;
const FIVE_SECONDS_MS = 5000;

describe('VoteBatchView', () => {
  it('votes, keeps the chips open, and sends the reasons with the vote on Next', async () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2');

    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    expect(castVote).toHaveBeenCalledWith({ designId: 'a', value: 1, reasons: [] });
    expect(screen.getByRole('heading', { name: messages.vote.reasonsHeading })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons.trees }));
    expect(castVote).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2');

    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsNext }));
    expect(castVote).toHaveBeenLastCalledWith({ designId: 'a', value: 1, reasons: ['trees'] });
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2');
    expect(screen.getByRole('heading', { name: 'Design b' })).toHaveFocus();
    expect(screen.queryByText(messages.vote.swipeHint)).toBeNull();
  });

  it('keeps 1 of N in one place under the stage across the picture, the 3D view and the chips', async () => {
    renderBatch([summary('a'), summary('b')]);
    const line = screen.getByTestId('vote-line');
    expect(within(line).getByRole('status')).toHaveTextContent('1 of 2');

    await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
    expect(screen.getByTestId('vote-line')).toBe(line);
    expect(within(line).getByRole('status')).toHaveTextContent('1 of 2');

    await userEvent.click(screen.getByRole('button', { name: messages.vote.showPicture }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    expect(within(screen.getByTestId('vote-line')).getByRole('status')).toHaveTextContent('1 of 2');
  });

  it('shows no vote buttons while the chips are open, so Next is the one primary action', async () => {
    renderBatch([summary('a'), summary('b')]);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    expect(screen.queryByRole('button', { name: messages.vote.up })).toBeNull();
    expect(screen.queryByRole('button', { name: messages.vote.down })).toBeNull();
    expect(screen.queryByText(messages.vote.swipeHint)).toBeNull();
  });

  it('keeps the chips open with no timer after 5 s of fake time', () => {
    vi.useFakeTimers();
    try {
      renderBatch([summary('a'), summary('b')]);
      fireEvent.click(screen.getByRole('button', { name: messages.vote.up }));
      act(() => {
        vi.advanceTimersByTime(FIVE_SECONDS_MS);
      });
      expect(screen.getByRole('region', { name: messages.vote.reasonsHeading })).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent('1 of 2');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('VoteBatchView reason chips', () => {
  it('keeps the vote and sends no reasons on Skip reasons', async () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.down }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons.trees }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsSkip }));
    expect(castVote).toHaveBeenCalledExactlyOnceWith({ designId: 'a', value: -1, reasons: [] });
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2');
    expect(screen.getByRole('heading', { name: 'Design b' })).toHaveFocus();
  });

  it('ignores swipes on the picture while the chips are open', async () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    swipe(...SWIPE_UP);
    swipe(...SWIPE_LEFT);
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2');
    expect(screen.getByRole('region', { name: messages.vote.reasonsHeading })).toBeVisible();
    expect(castVote).toHaveBeenCalledExactlyOnceWith({ designId: 'a', value: 1, reasons: [] });
  });

  it('skips without voting and reaches the end-of-batch choice', async () => {
    const { castVote, onVoteMore } = renderBatch([summary('a'), summary('b')]);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.skip }));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2');

    await userEvent.click(screen.getByRole('button', { name: messages.vote.down }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsNext }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'You voted on 1 design' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.voteMore }));
    expect(onVoteMore).toHaveBeenCalledOnce();
    // Next with no reasons sends nothing new: the vote went out when it was cast.
    expect(castVote).toHaveBeenCalledOnce();
  });

  it('shows the current design as a picture before any 3D loads', () => {
    renderBatch([summary('a'), summary('b')]);
    expect(
      screen.getByRole('img', { name: format(messages.vote.posterAlt, { title: 'Design a' }) }),
    ).toHaveAttribute('src', '/blobs/thumbnails/a.png');
    expect(screen.getByRole('button', { name: messages.vote.view3d })).toBeInTheDocument();
  });
});

describe('VoteBatchView pictures and swipes', () => {
  it('draws a flat plan when the design has no thumbnail yet', async () => {
    const getDesign = vi.fn((id: string) => Promise.resolve(fullDesign(id)));
    renderBatch([{ ...summary('a'), thumbnailUrl: null }], { getDesign });
    const poster = await screen.findByRole('img', {
      name: format(messages.vote.posterAlt, { title: 'Design a' }),
    });
    expect(poster.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
  });

  it('shows the site today while comparing, then the design again', async () => {
    const getDesign = vi.fn((id: string) => Promise.resolve(fullDesign(id, `/t/${id}.png`)));
    renderBatch([summary('a')], { getDesign, baselineDesignId: 'today' });
    const compare = screen.getByRole('button', { name: messages.vote.compare });
    await userEvent.click(compare);
    expect(compare).toHaveAttribute('aria-expanded', 'true');
    const today = format(messages.vote.posterAlt, { title: 'Design today' });
    expect(await screen.findByRole('img', { name: today })).toHaveAttribute('src', '/t/today.png');
    await userEvent.click(compare);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/blobs/thumbnails/a.png');
  });

  it('votes with a swipe on the picture and drops a reason tapped twice', async () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    swipe(...SWIPE_LEFT);
    // Votes leave through a queue, so the call lands a microtask later.
    await waitFor(() => {
      expect(castVote).toHaveBeenCalledWith({ designId: 'a', value: -1, reasons: [] });
    });
    const trees = screen.getByRole('button', { name: messages.vote.reasons.trees });
    await userEvent.click(trees);
    await userEvent.click(trees);
    expect(trees).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsNext }));
    expect(castVote).toHaveBeenLastCalledWith({ designId: 'a', value: -1, reasons: [] });
  });

  it('skips with an upward swipe', () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    swipe(...SWIPE_UP);
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2');
    expect(castVote).not.toHaveBeenCalled();
  });
});

describe('VoteBatchView on a failing link', () => {
  it('says a vote did not send, and sends it again once the browser is online', async () => {
    const { castVote } = renderBatch([summary('a'), summary('b')]);
    castVote.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    expect(await screen.findByText(messages.vote.sendFailed)).toBeVisible();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(screen.queryByText(messages.vote.sendFailed)).toBeNull();
    });
    expect(castVote).toHaveBeenCalledTimes(2);
    expect(castVote).toHaveBeenLastCalledWith({ designId: 'a', value: 1, reasons: [] });
  });
});

describe('VoteBatchView loading and errors', () => {
  it('shows an error with Try again when the design fails, and draws it on the retry', async () => {
    const getDesign = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementation((id: string) => Promise.resolve(fullDesign(id)));
    renderBatch([{ ...summary('a'), thumbnailUrl: null }], { getDesign });
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.vote.failed);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.retry }));
    expect(
      await screen.findByRole('img', {
        name: format(messages.vote.posterAlt, { title: 'Design a' }),
      }),
    ).toBeInTheDocument();
  });

  it('puts View in 3D below the picture, outside the clipped stage', () => {
    renderBatch([summary('a'), summary('b')]);
    const stage = screen.getByTestId('vote-stage');
    const view = screen.getByRole('button', { name: messages.vote.view3d });
    expect(stage).not.toContainElement(view);
  });

  it('shows the empty state when the batch is empty', () => {
    renderBatch([]);
    expect(screen.getByText(messages.vote.empty)).toBeInTheDocument();
  });
});

describe('VoteBatchView requests', () => {
  it('loads no full design for a stored picture until View in 3D opens', async () => {
    const getDesign = vi.fn().mockResolvedValue(fullDesign('a', '/blobs/thumbnails/a.webp'));
    renderBatch([summary('a')], { getDesign, baselineDesignId: 'base' });
    expect(screen.getByRole('img', { name: /Design a/ })).toBeInTheDocument();
    expect(getDesign).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
    expect(getDesign).toHaveBeenCalledWith('a');
    expect(getDesign).not.toHaveBeenCalledWith('base');
  });

  it('loads the baseline only once the voter compares', async () => {
    const getDesign = vi.fn().mockResolvedValue(fullDesign('base'));
    renderBatch([summary('a')], { getDesign, baselineDesignId: 'base' });
    expect(getDesign).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.compare }));
    expect(getDesign).toHaveBeenCalledWith('base');
  });
});
