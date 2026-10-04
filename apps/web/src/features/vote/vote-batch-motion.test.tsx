import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_EASING, MOTION_MS } from '@parkshape/ui';

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
  readonly onVoteRecorded?: () => void;
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
      onVoteRecorded={options.onVoteRecorded ?? (() => undefined)}
    />
  );
  const router = createMemoryRouter([{ path: '/v', Component: BatchRoute }], {
    initialEntries: ['/v'],
  });
  render(<RouterProvider router={router} />);
  return { castVote, getDesign, onVoteMore };
}

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

let played: Played[] = [];

function setReduced(reduce: 'reduce' | 'no-preference') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce === 'reduce' && query.includes('reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  played = [];
  setReduced('no-preference');
  Element.prototype.animate = function animate(this: Element, keyframes, options) {
    played.push({
      target: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
    });
    return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
});

async function voteThenNext(button: string) {
  await userEvent.click(screen.getByRole('button', { name: button }));
  played = [];
  await userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsNext }));
}

const ghost = () => played[0]?.target as HTMLElement | undefined;

const posterName = (title: string) => format(messages.vote.posterAlt, { title });

describe('Vote card advance (J14)', () => {
  it.each([
    [messages.vote.up, 'translateX(16px)'],
    [messages.vote.down, 'translateX(-16px)'],
  ])(
    'sends the card the way of the vote after %s, then fades the next one in',
    async (button, to) => {
      renderBatch([summary('a'), summary('b'), summary('c')]);
      await voteThenNext(button);
      expect(played).toHaveLength(2);
      expect(played[0]?.keyframes.at(-1)).toEqual({ opacity: 0, transform: to });
      expect(played[0]?.options).toMatchObject({
        duration: MOTION_MS.small,
        easing: MOTION_EASING.exit,
      });
      expect(played[1]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
      expect(played[1]?.options).toMatchObject({ duration: MOTION_MS.medium });
      expect(screen.getByRole('heading', { name: 'Design b' })).toHaveFocus();
    },
  );

  it('lifts the card 16 px after Skip', async () => {
    renderBatch([summary('a'), summary('b')]);
    played = [];
    await userEvent.click(screen.getByRole('button', { name: messages.vote.skip }));
    expect(played[0]?.keyframes.at(-1)).toEqual({ opacity: 0, transform: 'translateY(-16px)' });
  });

  it('never rotates or adds depth, and hides the outgoing copy from screen readers', async () => {
    renderBatch([summary('a'), summary('b')]);
    await voteThenNext(messages.vote.up);
    expect(JSON.stringify(played.map((call) => call.keyframes))).not.toMatch(/rotate|perspective/);
    expect(ghost()).toHaveAttribute('aria-hidden', 'true');
    expect(ghost()).toHaveClass('web-vote__ghost');
    expect(ghost()?.querySelector('[id]')).toBeNull();
    await waitFor(() => {
      expect(document.querySelector('.web-vote__ghost')).toBeNull();
    });
  });

  it('swaps at once under reduced motion, and progress and focus still move', async () => {
    setReduced('reduce');
    renderBatch([summary('a'), summary('b')]);
    await voteThenNext(messages.vote.up);
    expect(played).toHaveLength(0);
    expect(document.querySelector('.web-vote__ghost')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2');
    expect(screen.getByRole('heading', { name: 'Design b' })).toHaveFocus();
  });

  it('runs no card motion when the last vote ends the batch', async () => {
    renderBatch([summary('a')]);
    await voteThenNext(messages.vote.up);
    expect(played.filter((call) => call.options.duration === MOTION_MS.medium)).toHaveLength(0);
  });
});

describe('Vote card pictures (J14)', () => {
  it('fades the next design in on a new picture, so the last one never shows under its name', async () => {
    renderBatch([summary('a'), summary('b'), summary('c')]);
    const first = screen.getByRole('img', { name: posterName('Design a') });
    expect(first).toHaveAttribute('src', '/blobs/thumbnails/a.png');
    await voteThenNext(messages.vote.up);
    const next = screen.getByRole('img', { name: posterName('Design b') });
    expect(next).toHaveAttribute('src', '/blobs/thumbnails/b.png');
    expect(next).not.toBe(first);
    expect(played[1]?.target).toBe(next);
  });

  it('starts loading the next picture once the one on the card has loaded', () => {
    const created = vi.spyOn(document, 'createElement');
    renderBatch([summary('a'), summary('b'), summary('c')]);
    const warmed = () =>
      created.mock.results
        .map((result) => result.value as Element)
        .filter((node) => node instanceof HTMLImageElement && !node.isConnected)
        .map((node) => node.getAttribute('src'));
    expect(warmed()).not.toContain('/blobs/thumbnails/b.png');
    fireEvent.load(screen.getByRole('img', { name: posterName('Design a') }));
    expect(warmed()).toEqual(['/blobs/thumbnails/b.png']);
    created.mockRestore();
  });
});

describe('Vote buttons hold the vote (J15)', () => {
  it('keeps Vote down pressed while the reasons are open', async () => {
    renderBatch([summary('a'), summary('b')]);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.down }));
    const down = screen.getByRole('button', { name: messages.vote.down, hidden: true });
    expect(down).toHaveAttribute('data-held', 'true');
    expect(screen.getByRole('heading', { name: messages.vote.reasonsHeading })).toHaveFocus();
  });
});

describe('Voted flag for the leaderboard (J9)', () => {
  it('reports each recorded vote, so the next leaderboard view can show the rows it moved', async () => {
    const onVoteRecorded = vi.fn();
    renderBatch([summary('a'), summary('b')], { onVoteRecorded });
    await userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
    await waitFor(() => {
      expect(onVoteRecorded).toHaveBeenCalledOnce();
    });
  });

  it('reports nothing for a skip', async () => {
    const onVoteRecorded = vi.fn();
    renderBatch([summary('a'), summary('b')], { onVoteRecorded });
    await userEvent.click(screen.getByRole('button', { name: messages.vote.skip }));
    expect(onVoteRecorded).not.toHaveBeenCalled();
  });
});
