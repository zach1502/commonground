import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { FakeClock } from '@parkshape/core';

import type { Leaderboard, LeaderboardEntry, Project } from '../api/web-api';
import { format, messages } from '../messages';

import { LeaderboardPage } from './leaderboard-page';

const PROJECT = { id: 'jrp', name: 'Jonathan Rogers Park' } as unknown as Project;

function entry(
  id: string,
  rank: number,
  author: LeaderboardEntry['design']['author'],
): LeaderboardEntry {
  return {
    rank,
    score: 0.5,
    design: {
      id,
      title: `Design ${id}`,
      thumbnailUrl: null,
      badges: [],
      up: 3,
      down: 1,
      author,
    },
  } as unknown as LeaderboardEntry;
}

function board(ids: readonly string[]): Leaderboard {
  return {
    prior: { up: 2, down: 2 },
    entries: ids.map((id, index) => entry(id, index + 1, null)),
  };
}

const COUNTED = new Date('2026-09-26T22:20:00Z');

function renderBoard(initial: Leaderboard, api: { getLeaderboard: () => Promise<Leaderboard> }) {
  const clock = new FakeClock(COUNTED);
  const BoardRoute = () => (
    <LeaderboardPage
      deps={{
        api: api as never,
        pollIntervalMs: 20,
        clock,
        editor: { storage: { session: window.sessionStorage } } as never,
      }}
    />
  );
  const router = createMemoryRouter(
    [
      {
        path: '/b',
        loader: () => ({ project: PROJECT, board: initial }),
        Component: BoardRoute,
      },
    ],
    { initialEntries: ['/b'] },
  );
  render(<RouterProvider router={router} />);
}

describe('LeaderboardPage', () => {
  it('ranks designs in a table and offers the why-this-order note', async () => {
    renderBoard(board(['a', 'b']), {
      getLeaderboard: vi.fn().mockResolvedValue(board(['a', 'b'])),
    });
    await screen.findByRole('table');
    expect(
      screen.getByRole('columnheader', { name: messages.leaderboard.rankColumn }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: messages.leaderboard.scoreColumn }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(messages.leaderboard.anonymous)).toHaveLength(1);
  });

  it('says once, on the first hidden name, that names show after a vote', async () => {
    renderBoard(board(['a', 'b']), {
      getLeaderboard: vi.fn().mockResolvedValue(board(['a', 'b'])),
    });
    const table = await screen.findByRole('table');
    expect(table.querySelector('caption')).toBeNull();
    const hidden = table.querySelectorAll('.web-board__author--hidden');
    expect(hidden[0]).toHaveTextContent(messages.leaderboard.anonymous);
    expect(screen.getAllByText(messages.leaderboard.anonymous)).toHaveLength(1);
  });

  it('shows the name for designs the viewer voted on and leaves the rest blank', async () => {
    const mixed: Leaderboard = {
      prior: { up: 2, down: 2 },
      entries: [entry('a', 1, { id: 'u1', displayName: 'Molly Swingset' }), entry('b', 2, null)],
    };
    renderBoard(mixed, { getLeaderboard: vi.fn().mockResolvedValue(mixed) });
    const table = await screen.findByRole('table');
    const cells = [...table.querySelectorAll('.web-board__author')];
    expect(cells[0]).toHaveTextContent('Molly Swingset');
    const hidden = cells[1];
    expect(hidden).toHaveClass('web-board__author--hidden');
    expect(hidden?.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(hidden?.textContent).toBe(messages.leaderboard.anonymous);
    expect(hidden?.querySelector('.web-board__anon')).toHaveTextContent(
      messages.leaderboard.anonymous,
    );
    expect(screen.getAllByText(messages.leaderboard.anonymous)).toHaveLength(1);
  });

  it('leaves out the caption when every name shows', async () => {
    const named: Leaderboard = {
      prior: { up: 2, down: 2 },
      entries: [entry('a', 1, { id: 'u1', displayName: 'Molly Swingset' })],
    };
    renderBoard(named, { getLeaderboard: vi.fn().mockResolvedValue(named) });
    const table = await screen.findByRole('table');
    expect(table.querySelector('caption')).toBeNull();
    expect(table.querySelector('.web-board__author--hidden')).toBeNull();
    expect(screen.queryByText(messages.leaderboard.authorNote)).toBeNull();
  });
});

describe('LeaderboardPage By column', () => {
  it('keeps the By column and says once, under its header, when names show', async () => {
    renderBoard(board(['a', 'b']), {
      getLeaderboard: vi.fn().mockResolvedValue(board(['a', 'b'])),
    });
    const table = await screen.findByRole('table');
    const headers = [...table.querySelectorAll('thead th')];
    const by = headers.at(-1);
    expect(by).toHaveTextContent(messages.leaderboard.authorColumn);
    expect(screen.getAllByText(messages.leaderboard.authorNote)).toHaveLength(1);
    expect(by).toContainElement(screen.getByText(messages.leaderboard.authorNote));
    expect(table.querySelectorAll('tbody tr')[0]?.children).toHaveLength(headers.length);
  });
});

describe('LeaderboardPage finish', () => {
  it('puts the park name above a short heading and says when votes were counted', async () => {
    renderBoard(board(['a']), { getLeaderboard: vi.fn().mockResolvedValue(board(['a'])) });
    expect(
      await screen.findByRole('heading', { level: 1, name: messages.leaderboard.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(PROJECT.name)).toHaveClass('ps-page-title__context');
    expect(document.querySelector('.ps-counted-at')).toHaveTextContent(
      format(messages.leaderboard.countedAt, { time: '26 September 2026, 3:20 pm' }),
    );
  });

  it('right-aligns bare numbers under headers that carry the unit', async () => {
    renderBoard(board(['a']), { getLeaderboard: vi.fn().mockResolvedValue(board(['a'])) });
    const cell = await screen.findByRole('cell', { name: '50' });
    expect(cell).toHaveClass('ps-table__num');
    expect(screen.getByRole('cell', { name: '3' })).toHaveClass('ps-table__num');
  });

  it('hides the Change column while no design has moved', async () => {
    renderBoard(board(['a', 'b']), { getLeaderboard: () => new Promise(() => undefined) });
    await screen.findByRole('table');
    expect(
      screen.queryByRole('columnheader', { name: messages.leaderboard.changeColumn }),
    ).toBeNull();
  });

  it('hides a badge that every row carries and keeps one that marks a single row', async () => {
    const shared = { key: 'canopy', message: 'Short.', badge: 'Canopy 96% short' } as const;
    const own = { key: 'budget', message: 'Over.', badge: 'Over budget 12%' } as const;
    const initial = board(['a', 'b']);
    const withBadges: Leaderboard = {
      ...initial,
      entries: initial.entries.map((row, index) => ({
        ...row,
        design: { ...row.design, badges: index === 0 ? [shared, own] : [shared] },
      })),
    };
    renderBoard(withBadges, { getLeaderboard: () => new Promise(() => undefined) });
    await screen.findByRole('table');
    expect(screen.queryByText('Canopy 96% short')).toBeNull();
    expect(screen.getByText('Over budget 12%')).toBeInTheDocument();
  });

  it('shows a rank-change arrow after a poll moves a design up', async () => {
    const getLeaderboard = vi.fn().mockResolvedValue(board(['b', 'a']));
    renderBoard(board(['a', 'b']), { getLeaderboard });
    await waitFor(() => {
      expect(screen.getByText('Up 1')).toBeInTheDocument();
      expect(screen.getByText('Down 1')).toBeInTheDocument();
    });
  });

  it('shows the empty state when no designs are live', async () => {
    renderBoard(board([]), { getLeaderboard: vi.fn().mockResolvedValue(board([])) });
    expect(await screen.findByText(messages.leaderboard.empty)).toBeInTheDocument();
  });
});

const MAX_TABS = 20;

describe('LeaderboardPage score note', () => {
  it('explains the score in one sentence with no mention of the starting votes', async () => {
    renderBoard(board(['a', 'b']), {
      getLeaderboard: vi.fn().mockResolvedValue(board(['a', 'b'])),
    });
    await screen.findByRole('table');
    const trigger = screen.getByRole('button', { name: messages.leaderboard.scoreColumn });
    // The BC tooltip opens on keyboard focus, so tab to the trigger as a keyboard user would.
    for (let step = 0; step < MAX_TABS && document.activeElement !== trigger; step += 1) {
      await userEvent.tab();
    }
    const note = await screen.findByRole('tooltip');
    expect(note).toHaveTextContent(messages.leaderboard.whyBody);
    expect(note.textContent).not.toMatch(/\d/);
    expect(note.textContent.match(/\./g)).toHaveLength(1);
  });
});
