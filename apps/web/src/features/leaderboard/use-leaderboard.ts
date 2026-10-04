import { useEffect, useRef, useState } from 'react';

import type { Clock } from '@parkshape/core';

import type { Leaderboard, WebApi } from '../../api/web-api';

import { anyRankChanged, ranksById } from './rank-change';
import type { VisitStore } from './visit-ranks';

export interface LeaderboardSnapshot {
  readonly board: Leaderboard;
  /** Rank numbers from the poll before this one, for the rank-change arrows. */
  readonly previous: ReadonlyMap<string, number>;
  /** When these counts arrived, for the "Votes counted to" line. */
  readonly countedAt: Date;
}

/**
 * How the first view arrives: 'flip' slides the rows the reader's own vote moved since their last
 * visit; 'still' reveals the board with nothing moving inside it. Polls never reorder with motion.
 */
export interface BoardArrival {
  readonly reorder: 'flip' | 'still';
  /** Ranks at the reader's last visit, or the board's own ranks on a first visit. */
  readonly previous: ReadonlyMap<string, number>;
  /** Clears the voted flag once the reorder has run, so the next view stays still. */
  readonly done: () => void;
}

export interface PollOptions {
  readonly intervalMs: number;
  readonly clock: Clock;
  readonly visits: VisitStore;
}

const idsOf = (board: Leaderboard): string[] => board.entries.map((entry) => entry.design.id);

function rowsOf(board: Leaderboard) {
  return board.entries.map((entry) => ({ id: entry.design.id, rank: entry.rank }));
}

/** Reads the last visit once, on mount, and decides whether this view replays a reorder. */
function useArrival(visits: VisitStore, projectId: string, initial: Leaderboard): BoardArrival {
  const arrival = useRef<BoardArrival | null>(null);
  if (arrival.current === null) {
    const visit = visits.read(projectId);
    const previous =
      visit === null || visit.ranks.size === 0 ? ranksById(idsOf(initial)) : visit.ranks;
    const moved = anyRankChanged(rowsOf(initial), previous) === 'some';
    arrival.current = {
      reorder: visit?.votedSinceLastVisit === true && moved ? 'flip' : 'still',
      previous,
      done: () => {
        visits.clearVoted(projectId);
      },
    };
  }
  return arrival.current;
}

/**
 * Holds the leaderboard and refreshes it on an interval, skipping polls while the tab is hidden.
 * Each refresh keeps the prior order so the page can show how far each design moved.
 */
export function useLeaderboard(
  api: Pick<WebApi, 'getLeaderboard'>,
  projectId: string,
  initial: Leaderboard,
  { intervalMs, clock, visits }: PollOptions,
): LeaderboardSnapshot & { readonly arrival: BoardArrival } {
  const arrival = useArrival(visits, projectId, initial);
  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot>(() => ({
    board: initial,
    previous: arrival.previous,
    countedAt: clock.now(),
  }));

  useEffect(() => {
    visits.saveRanks(projectId, ranksById(idsOf(snapshot.board)));
  }, [visits, projectId, snapshot.board]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.hidden) {
        return;
      }
      const fresh = await api.getLeaderboard(projectId).catch(() => null);
      if (active && fresh !== null) {
        setSnapshot((prev) => ({
          board: fresh,
          previous: ranksById(idsOf(prev.board)),
          countedAt: clock.now(),
        }));
      }
    };
    const handle = window.setInterval(() => void poll(), intervalMs);
    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [api, projectId, intervalMs, clock]);

  return { ...snapshot, arrival };
}
