import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { DesignSummary, Project } from '../../api/web-api';
import { messages } from '../../messages';
import { PATHS } from '../../routing/paths';

import { VoteBatchView } from './vote-batch-view';

// The stub keeps three.js out of jsdom.
vi.mock('./vote-warm', () => ({ warmVoteModel: vi.fn(), loadVoteViewer: vi.fn() }));
vi.mock('./vote-model', () => {
  function StubModel() {
    return null;
  }
  return { VoteModel: StubModel };
});

const PROJECT = {
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  phase: 'open',
  closesAt: '2026-10-31',
  parcel: {},
} as unknown as Project;

function summary(id: string, thumbnailUrl: string | null = `/blobs/thumbnails/${id}.png`) {
  return {
    id,
    title: `Design ${id}`,
    thumbnailUrl,
    badges: [],
    up: 0,
    down: 0,
  } as unknown as DesignSummary;
}

function renderBatch(candidates: readonly DesignSummary[], project: Project = PROJECT) {
  const api = {
    getDesign: vi.fn().mockReturnValue(new Promise(() => undefined)),
    castVote: vi.fn().mockResolvedValue(undefined),
    getTerrain: vi.fn().mockReturnValue(new Promise(() => undefined)),
    getContext: vi.fn().mockReturnValue(new Promise(() => undefined)),
    setMyVote: vi.fn(),
    withdrawMyVote: vi.fn(),
  };
  const BatchRoute = () => (
    <VoteBatchView
      api={api}
      project={project}
      candidates={candidates}
      baselineDesignId={null}
      onVoteMore={vi.fn()}
      onVoteRecorded={vi.fn()}
    />
  );
  const router = createMemoryRouter([{ path: '/v', Component: BatchRoute }], {
    initialEntries: ['/v'],
  });
  render(<RouterProvider router={router} />);
  return api;
}

const voteUp = () => userEvent.click(screen.getByRole('button', { name: messages.vote.up }));
const voteDown = () => userEvent.click(screen.getByRole('button', { name: messages.vote.down }));
const skip = () => userEvent.click(screen.getByRole('button', { name: messages.vote.skip }));
const next = () => userEvent.click(screen.getByRole('button', { name: messages.vote.reasonsNext }));

describe('VoteBatchView card title', () => {
  it('shows the design title as a visible H2 above the picture, and the progress under it', () => {
    renderBatch([summary('a'), summary('b')]);
    const heading = screen.getByRole('heading', { level: 2, name: 'Design a' });
    expect(heading).not.toHaveClass('ps-visually-hidden');
    const progress = screen.getByRole('status');
    const picture = screen.getByRole('img');
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(heading.compareDocumentPosition(picture) & follows).toBeTruthy();
    expect(picture.compareDocumentPosition(progress) & follows).toBeTruthy();
  });

  it('puts Compare with today beside View in 3D under the picture', () => {
    renderBatch([summary('a'), summary('b')]);
    const picture = screen.getByRole('img');
    const view3d = screen.getByRole('button', { name: messages.vote.view3d });
    const compare = screen.getByRole('button', { name: messages.vote.compare });
    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(picture.compareDocumentPosition(compare) & follows).toBeTruthy();
    expect(compare.closest('.web-vote__open-model')).toBe(view3d.closest('.web-vote__open-model'));
  });
});

describe('VoteBatchView vote confirmation', () => {
  it('opens the reasons question with no line restating the vote, and closes on Next', async () => {
    renderBatch([summary('a'), summary('b')]);
    await voteUp();
    const region = screen.getByRole('region', { name: messages.vote.reasonsHeading });
    expect(
      within(region).getByRole('heading', { name: messages.vote.reasonsHeading }),
    ).toBeInTheDocument();
    expect(region.querySelector('.web-vote__voted')).toBeNull();
    await next();
    expect(screen.queryByRole('region', { name: messages.vote.reasonsHeading })).toBeNull();
  });

  it('holds one line under the stage before a vote: the progress and the swipe hint', () => {
    renderBatch([summary('a'), summary('b')]);
    const line = screen.getByTestId('vote-line');
    expect(within(line).getByRole('status')).toHaveTextContent('1 of 2');
    expect(within(line).getByText(messages.vote.swipeHint)).toBeInTheDocument();
    expect(screen.queryByTestId('vote-region')).toBeNull();
    expect(screen.queryByRole('button', { name: messages.vote.reasons.play })).toBeNull();
  });

  it('opens the reasons question after Vote down', async () => {
    renderBatch([summary('a'), summary('b')]);
    await voteDown();
    expect(screen.getByRole('region', { name: messages.vote.reasonsHeading })).toBeVisible();
  });
});

describe('VoteBatchView reasons sheet', () => {
  it('opens the chips as a sheet with focus on its question', async () => {
    renderBatch([summary('a'), summary('b')]);
    await voteUp();
    const sheet = screen.getByRole('region', { name: messages.vote.reasonsHeading });
    expect(sheet).toHaveClass('ps-reason-chips--sheet');
    expect(
      within(sheet).getByRole('heading', { name: messages.vote.reasonsHeading }),
    ).toHaveFocus();
  });

  it('keeps the vote buttons in place under the sheet, out of reach, so nothing moves', async () => {
    renderBatch([summary('a'), summary('b')]);
    const band = screen.getByTestId('vote-actions');
    const stageStyle = screen.getByTestId('vote-stage').getAttribute('style');
    await voteUp();
    expect(screen.getByTestId('vote-actions')).toBe(band);
    expect(band).toHaveAttribute('inert');
    expect(band).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('vote-stage').getAttribute('style')).toBe(stageStyle);
    expect(document.querySelectorAll('.primary:not([inert] *)')).toHaveLength(1);
  });

  it('closes on Escape with no reasons and moves focus to the next design', async () => {
    const api = renderBatch([summary('a'), summary('b')]);
    await voteUp();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons.trees }));
    screen.getByRole('heading', { name: messages.vote.reasonsHeading }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: messages.vote.reasonsHeading })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Design b' })).toHaveFocus();
    expect(screen.getByTestId('vote-actions')).not.toHaveAttribute('inert');
    expect(api.castVote).toHaveBeenLastCalledWith({ designId: 'a', value: 1, reasons: [] });
  });
});

describe('VoteBatchView end of batch', () => {
  it('lists each design with its vote, a skip included, under a count heading', async () => {
    renderBatch([summary('a'), summary('b', null), summary('c')]);
    await voteUp();
    await next();
    await skip();
    await voteDown();
    await next();

    expect(screen.getByRole('heading', { level: 1, name: 'You voted on 2 designs' })).toBeVisible();
    expect(screen.getByText('Voting closes 31 October 2026.')).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector('.web-vote__result-vote')).toHaveTextContent(
      messages.vote.resultUp,
    );
    expect(rows[1]?.querySelector('.web-vote__result-vote')).toHaveTextContent(
      messages.vote.resultSkipped,
    );
    expect(rows[2]?.querySelector('.web-vote__result-vote')).toHaveTextContent(
      messages.vote.resultDown,
    );
    const link = within(rows[0] ?? document.body).getByRole('link', { name: 'Design a' });
    expect(link).toHaveAttribute('href', PATHS.designView('a'));
    expect(within(rows[0] ?? document.body).getByRole('img')).toHaveAttribute(
      'src',
      '/blobs/thumbnails/a.png',
    );
    expect(within(rows[1] ?? document.body).queryByRole('img')).toBeNull();
  });

  it('gives every row its result through the accessible name but hides the visible badge when every vote matches', async () => {
    renderBatch([summary('a'), summary('b')]);
    await voteUp();
    await next();
    await voteUp();
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'You voted on 2 designs' })).toBeVisible();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row).toHaveTextContent(messages.vote.resultUp);
      expect(row.querySelector('.web-vote__result-vote')).toBeNull();
      expect(row.querySelector('.ps-visually-hidden')).toHaveTextContent(messages.vote.resultUp);
    });
  });
});

describe('VoteBatchView end of batch actions', () => {
  it('keeps Vote on 5 more the one filled button and links the self-report page as text', async () => {
    renderBatch([summary('a')]);
    await voteUp();
    await next();
    expect(screen.getByRole('heading', { level: 1, name: 'You voted on 1 design' })).toBeVisible();
    const more = screen.getByRole('button', { name: messages.vote.voteMore });
    expect(more).toHaveClass('primary');
    expect(screen.getByRole('link', { name: messages.vote.seeLeaderboard })).toHaveClass(
      'secondary',
    );
    const report = screen.getByRole('link', { name: messages.vote.selfReportLink });
    expect(report).toHaveAttribute('href', PATHS.selfReport);
    expect(report).not.toHaveClass('primary');
    expect(document.querySelectorAll('.primary')).toHaveLength(1);
  });

  it('leaves out the closing line when the project has no closing day', async () => {
    renderBatch([summary('a')], { ...PROJECT, closesAt: null });
    await skip();
    expect(screen.getByRole('heading', { level: 1, name: 'You voted on 0 designs' })).toBeVisible();
    expect(screen.queryByText(/Voting closes/)).toBeNull();
  });
});
