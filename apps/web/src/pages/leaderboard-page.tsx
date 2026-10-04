import { useLayoutEffect, useMemo, useRef } from 'react';
import { useLoaderData } from 'react-router';

import {
  Badge,
  ButtonLink,
  CountedAt,
  EmptyState,
  InfoTooltip,
  keysSharedByAll,
  PageTitle,
  RankChange,
} from '@parkshape/ui';

import type { Leaderboard, LeaderboardEntry, Project } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { arriveBoard } from '../features/leaderboard/flip-rows';
import {
  anyRankChanged,
  rankChangeFor,
  scorePercent,
  type RankChangeResult,
} from '../features/leaderboard/rank-change';
import { useLeaderboard, type BoardArrival } from '../features/leaderboard/use-leaderboard';
import { createVisitStore } from '../features/leaderboard/visit-ranks';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';
import { PATHS } from '../routing/paths';

// Stored thumbnails are 640 by 400, so the row picture keeps that 8:5 shape.
const THUMB_WIDTH = 48;
const THUMB_HEIGHT = 30;

const text = messages.leaderboard;

interface LeaderboardData {
  readonly project: Project;
  readonly board: Leaderboard;
}

function changeLabel(change: RankChangeResult): string {
  if (change.direction === 'up') return format(text.rankUp, { places: change.places });
  if (change.direction === 'down') return format(text.rankDown, { places: change.places });
  return text.rankSame;
}

/** The thumbnail, or a plain block of the same size, so every row has the same height. */
function RowPicture({ design }: { readonly design: LeaderboardEntry['design'] }) {
  if (design.thumbnailUrl === null) {
    return <span className="web-board__thumb web-board__thumb--none" aria-hidden="true" />;
  }
  return (
    <img
      className="web-board__thumb"
      src={design.thumbnailUrl}
      alt={format(text.thumbnailAlt, { title: design.title })}
      width={THUMB_WIDTH}
      height={THUMB_HEIGHT}
    />
  );
}

interface RowProps {
  readonly entry: LeaderboardEntry;
  readonly previous: ReadonlyMap<string, number>;
  readonly hiddenBadges: ReadonlySet<string>;
  readonly showChange: 'some' | 'none';
  readonly firstHiddenId: string | null;
}

function BoardRow({ entry, previous, hiddenBadges, showChange, firstHiddenId }: RowProps) {
  const { design } = entry;
  const change = rankChangeFor(design.id, entry.rank, previous);
  const badges = design.badges.filter((badge) => !hiddenBadges.has(badge.key));
  return (
    <tr className="web-board__row" data-design-id={design.id}>
      <td className="ps-table__num web-board__rank" data-kind="data">
        {entry.rank}
      </td>
      <td className="web-board__cell-design">
        <div className="web-board__design">
          <RowPicture design={design} />
          <div className="web-board__title">
            <a href={PATHS.designView(design.id)} data-kind="data">
              {design.title}
            </a>
            {badges.length === 0 ? null : (
              <span className="web-board__badges" data-kind="data">
                {badges.map((badge) => (
                  <Badge key={badge.key} tone="warning">
                    {badge.badge}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="ps-table__num web-board__score" data-kind="data">
        {scorePercent(entry.score)}
      </td>
      <td className="ps-table__num web-board__votes" data-kind="data">
        {design.up}
      </td>
      <td className="ps-table__num web-board__votes" data-kind="data">
        {design.down}
      </td>
      {showChange === 'some' ? (
        <td className="web-board__change" data-kind="data">
          <RankChange direction={change.direction} label={changeLabel(change)} />
        </td>
      ) : null}
      <AuthorCell author={design.author} showAnonymous={design.id === firstHiddenId} />
    </tr>
  );
}

// A hidden name leaves the cell blank; the first hidden row carries the short note that says why.
function AuthorCell({
  author,
  showAnonymous,
}: {
  readonly author: LeaderboardEntry['design']['author'];
  readonly showAnonymous: boolean;
}) {
  if (author !== null) {
    return (
      <td className="web-board__author" data-kind="data">
        {author.displayName}
      </td>
    );
  }
  return (
    <td className="web-board__author web-board__author--hidden">
      {showAnonymous ? (
        <span className="web-board__anon">{text.anonymous}</span>
      ) : (
        <span className="ps-visually-hidden">{text.authorHidden}</span>
      )}
    </td>
  );
}

/** By, with a note under it while any name is hidden. The caption says the same to readers. */
function AuthorHeader({ names }: { readonly names: 'all-shown' | 'some-hidden' }) {
  return (
    <th scope="col" className="web-board__by">
      {text.authorColumn}
      {names === 'some-hidden' ? (
        <span className="web-board__by-note" aria-hidden="true">
          {text.authorNote}
        </span>
      ) : null}
    </th>
  );
}

interface TableProps {
  readonly board: Leaderboard;
  readonly previous: ReadonlyMap<string, number>;
  readonly arrival: BoardArrival;
}

/** Plays the board's arrival once, on mount; a later poll changes rows with no motion. */
function useArrivalMotion(arrival: BoardArrival) {
  const body = useRef<HTMLTableSectionElement>(null);
  useLayoutEffect(() => {
    if (body.current !== null) arriveBoard(body.current, arrival);
    arrival.done();
  }, [arrival]);
  return body;
}

function BoardTable({ board, previous, arrival }: TableProps) {
  const body = useArrivalMotion(arrival);
  const hiddenBadges = keysSharedByAll(board.entries.map((entry) => entry.design.badges));
  const rows = board.entries.map((entry) => ({ id: entry.design.id, rank: entry.rank }));
  const showChange = anyRankChanged(rows, previous);
  const anyHidden = board.entries.some((entry) => entry.design.author === null);
  const firstHiddenId =
    board.entries.find((entry) => entry.design.author === null)?.design.id ?? null;
  return (
    <table className="ps-table web-board__table">
      <thead>
        <tr>
          <th scope="col" className="ps-table__num">
            {text.rankColumn}
          </th>
          <th scope="col">{text.designColumn}</th>
          <th scope="col" className="ps-table__num">
            <InfoTooltip triggerLabel={text.scoreColumn}>{text.whyBody}</InfoTooltip>
          </th>
          <th scope="col" className="ps-table__num web-board__votes">
            {text.upColumn}
          </th>
          <th scope="col" className="ps-table__num web-board__votes">
            {text.downColumn}
          </th>
          {showChange === 'some' ? <th scope="col">{text.changeColumn}</th> : null}
          <AuthorHeader names={anyHidden ? 'some-hidden' : 'all-shown'} />
        </tr>
      </thead>
      <tbody ref={body}>
        {board.entries.map((entry) => (
          <BoardRow
            key={entry.design.id}
            entry={entry}
            previous={previous}
            hiddenBadges={hiddenBadges}
            showChange={showChange}
            firstHiddenId={firstHiddenId}
          />
        ))}
      </tbody>
    </table>
  );
}

/** The ranked table of live designs, refreshed by polling, with rank-change arrows. */
export function LeaderboardPage({
  deps,
}: {
  readonly deps: Pick<WebDeps, 'api' | 'pollIntervalMs' | 'clock' | 'editor'>;
}) {
  const { project, board } = useLoaderData<LeaderboardData>();
  useDocumentMeta({
    title: messages.meta.leaderboard.title,
    description: format(messages.meta.leaderboard.description, { name: project.name }),
    image: null,
  });
  const session = deps.editor.storage.session;
  const visits = useMemo(() => createVisitStore(session), [session]);
  const snapshot = useLeaderboard(deps.api, project.id, board, {
    intervalMs: deps.pollIntervalMs,
    clock: deps.clock,
    visits,
  });
  const empty = snapshot.board.entries.length === 0;
  return (
    <div className="web-page web-board">
      <PageTitle context={project.name}>{text.heading}</PageTitle>
      <div className="web-board__meta">
        {empty ? null : <CountedAt template={text.countedAt} at={snapshot.countedAt} />}
        {empty ? null : (
          <ButtonLink variant="secondary" href={PATHS.vote(project.id)}>
            {text.backToVote}
          </ButtonLink>
        )}
      </div>
      {empty ? (
        <EmptyState
          text={text.empty}
          action={{ href: PATHS.newDesign(project.id), label: text.emptyAction }}
        />
      ) : (
        <BoardTable
          board={snapshot.board}
          previous={snapshot.previous}
          arrival={snapshot.arrival}
        />
      )}
    </div>
  );
}
