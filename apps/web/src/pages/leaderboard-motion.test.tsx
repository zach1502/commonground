import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeClock } from '@parkshape/core';
import { MOTION_EASING, MOTION_MS } from '@parkshape/ui';

import type { Leaderboard, LeaderboardEntry, Project } from '../api/web-api';
import { createVisitStore } from '../features/leaderboard/visit-ranks';
import { messages } from '../messages';

import { LeaderboardPage } from './leaderboard-page';

const PROJECT = { id: 'jrp', name: 'Jonathan Rogers Park' } as unknown as Project;
const ROW_HEIGHT = 40;
const POLL_MS = 20;

function board(ids: readonly string[], up = 3): Leaderboard {
  return {
    prior: { up: 2, down: 2 },
    entries: ids.map(
      (id, index) =>
        ({
          rank: index + 1,
          score: 0.5,
          design: {
            id,
            title: `Design ${id}`,
            thumbnailUrl: null,
            badges: [],
            up,
            down: 1,
            author: null,
          },
        }) as unknown as LeaderboardEntry,
    ),
  };
}

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
}

let played: Played[] = [];
let order: string[] = [];

function setReduced(reduce: 'reduce' | 'no-preference') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce === 'reduce' && query.includes('reduce'),
  }));
}

beforeEach(() => {
  played = [];
  order = [];
  setReduced('no-preference');
  Element.prototype.animate = function animate(this: Element, keyframes, options) {
    order.push('write');
    played.push({
      target: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
    });
    return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
  };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(
    this: Element,
  ) {
    order.push('read');
    const index =
      this.parentElement === null ? 0 : Array.from(this.parentElement.children).indexOf(this);
    return { top: index * ROW_HEIGHT } as DOMRect;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Leave no fake on the prototype for other files.
  delete (Element.prototype as Partial<Element>).animate;
});

function renderBoard(initial: Leaderboard, next: Leaderboard = initial) {
  const getLeaderboard = vi.fn().mockResolvedValue(next);
  const clock = new FakeClock(new Date('2026-09-26T22:20:00Z'));
  const storage = { session: window.sessionStorage, local: window.localStorage };
  const BoardRoute = () => (
    <LeaderboardPage
      deps={{
        api: { getLeaderboard } as never,
        pollIntervalMs: POLL_MS,
        clock,
        editor: { storage } as never,
      }}
    />
  );
  const router = createMemoryRouter(
    [{ path: '/b', loader: () => ({ project: PROJECT, board: initial }), Component: BoardRoute }],
    { initialEntries: ['/b'] },
  );
  render(<RouterProvider router={router} />);
  return { getLeaderboard };
}

const visits = () => createVisitStore(window.sessionStorage);
const rowsPlayed = () => played.filter((call) => call.target.tagName === 'TR');
const bodyPlayed = () => played.filter((call) => call.target.tagName === 'TBODY');

describe('Leaderboard body reveal (J8)', () => {
  it('fades the table body in once over 150 ms and animates no row', async () => {
    renderBoard(board(['a', 'b', 'c']));
    await screen.findByRole('table');
    expect(bodyPlayed()).toHaveLength(1);
    expect(bodyPlayed()[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(bodyPlayed()[0]?.options).toMatchObject({ duration: MOTION_MS.small, delay: 0 });
    // No fill holds a frame once the fade ends, so the body shows the rows it now holds.
    expect(bodyPlayed()[0]?.options.fill).toBeUndefined();
    expect(bodyPlayed()[0]?.target).toHaveTextContent('Design c');
    expect(rowsPlayed()).toHaveLength(0);
  });
});

describe('Leaderboard poll (J9, J11)', () => {
  it('starts no animation when a poll reorders the rows and swaps a count once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderBoard(board(['a', 'b']), board(['b', 'a'], 4));
    await screen.findByRole('table');
    played = [];
    const cell = screen.getAllByRole('row')[1]?.querySelectorAll('td')[3];
    const changes: string[] = [];
    const observer = new MutationObserver(() => {
      changes.push(cell?.textContent ?? '');
    });
    if (cell !== undefined)
      observer.observe(cell, { subtree: true, characterData: true, childList: true });
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await Promise.resolve();
    });
    vi.useRealTimers();
    const [, firstRow] = screen.getAllByRole('row');
    if (firstRow === undefined) throw new Error('the board has no rows');
    expect(within(firstRow).getByText('Design b')).toBeInTheDocument();
    expect(played).toHaveLength(0);
    expect(new Set(changes).size).toBeLessThanOrEqual(1);
    observer.disconnect();
  });
});

describe('Leaderboard reorder after your own vote (J9)', () => {
  // The 20 ms poll would replace the arrival's ranks on a slow machine, so these tests hold it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs no row animation for a rank change when the voted flag is unset', async () => {
    visits().saveRanks(
      'jrp',
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
    );
    renderBoard(board(['c', 'a', 'b']));
    await screen.findByRole('table');
    expect(rowsPlayed()).toHaveLength(0);
    expect(
      screen.getByRole('columnheader', { name: messages.leaderboard.changeColumn }),
    ).toBeInTheDocument();
  });

  it('slides only the moved rows from their old slots, once, and clears the flag', async () => {
    visits().saveRanks(
      'jrp',
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]),
    );
    visits().markVoted('jrp');
    renderBoard(board(['b', 'a', 'c', 'd']));
    await screen.findByRole('table');
    expect(rowsPlayed().map((call) => call.keyframes[0])).toEqual([
      { transform: `translateY(${String(ROW_HEIGHT)}px)` },
      { transform: `translateY(${String(-ROW_HEIGHT)}px)` },
    ]);
    expect(rowsPlayed()[0]?.options).toMatchObject({
      duration: MOTION_MS.medium,
      easing: MOTION_EASING.move,
    });
    // No fill holds a slide's first frame, so each row rests in its new place once it ends.
    expect(rowsPlayed().map((call) => call.options.fill)).toEqual([undefined, undefined]);
    expect(rowsPlayed()[0]?.target).toHaveTextContent('Design b');
    expect(bodyPlayed()).toHaveLength(0);
    expect(order.indexOf('write')).toBeGreaterThan(order.lastIndexOf('read'));
    expect(visits().read('jrp')?.votedSinceLastVisit).toBe(false);
  });
});

describe('Leaderboard visit record (J9)', () => {
  it('saves the ranks shown, so the next visit compares with them', async () => {
    renderBoard(board(['b', 'a']));
    await screen.findByRole('table');
    expect(visits().read('jrp')?.ranks).toEqual(
      new Map([
        ['b', 1],
        ['a', 2],
      ]),
    );
  });

  it('moves nothing under reduced motion and still clears the flag', async () => {
    setReduced('reduce');
    visits().saveRanks(
      'jrp',
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    visits().markVoted('jrp');
    renderBoard(board(['b', 'a']));
    await screen.findByRole('table');
    expect(played).toHaveLength(0);
    expect(visits().read('jrp')?.votedSinceLastVisit).toBe(false);
  });
});
