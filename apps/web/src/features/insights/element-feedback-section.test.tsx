import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TEST_API_URL } from '../../test/api-server';
import { commentOf, REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

import type { DesignFeedback, ElementComments, FeedbackApi } from './element-feedback-model';
import { ElementFeedbackSection } from './element-feedback-section';

const kinds = (counts: Partial<DesignFeedback['byKind']>) => ({
  keep: 0,
  move: 0,
  change: 0,
  remove: 0,
  question: 0,
  ...counts,
});

const FEEDBACK = {
  total: 4,
  designs: [
    {
      designId: 'd1',
      title: 'Shady corner',
      total: 3,
      byElementKind: { item: 2, path: 0, area: 1 },
      byKind: kinds({ move: 2, keep: 1 }),
    },
    {
      designId: 'd2',
      title: 'Open lawn',
      total: 1,
      byElementKind: { item: 1, path: 0, area: 0 },
      byKind: kinds({ question: 1 }),
    },
  ],
};

const benchComments = [
  commentOf({ id: 'c1', kind: 'move', text: 'Face the playground' }),
  commentOf({ id: 'c2', kind: 'move', text: 'Closer to the swings' }),
];
const GROUPS: ElementComments[] = [
  {
    elementId: 'bench-1',
    elementKind: 'item',
    category: 'seating',
    label: 'Bench, south-west',
    counts: kinds({ move: 2 }),
    openCount: 2,
    comments: benchComments,
  },
  {
    elementId: 'lawn-1',
    elementKind: 'area',
    category: 'ground',
    label: 'Lawn, south-east',
    counts: kinds({ keep: 1 }),
    openCount: 1,
    comments: [commentOf({ id: 'c3', elementId: 'lawn-1', elementKind: 'area', text: '' })],
  },
];

function fakeApi(): FeedbackApi {
  return {
    elementFeedback: vi.fn(async () => Promise.resolve(FEEDBACK)),
    listComments: vi.fn(async (designId: string) =>
      Promise.resolve({ designId, commenting: 'open' as const, elements: GROUPS }),
    ),
    resolveComment: vi.fn(async (commentId: string) =>
      Promise.resolve(commentOf({ id: commentId, status: 'resolved' })),
    ),
    hideComment: vi.fn(async (commentId: string) =>
      Promise.resolve(commentOf({ id: commentId, hidden: true })),
    ),
    getDesign: vi.fn(async () => Promise.resolve(REVIEW_DESIGN)),
  };
}

function renderSection(api = fakeApi()) {
  render(<ElementFeedbackSection project={REVIEW_PROJECT} api={api} apiBaseUrl={TEST_API_URL} />);
  return api;
}

const section = () => screen.getByRole('region', { name: 'Element feedback' });

describe('ElementFeedbackSection', () => {
  it('picks the most commented design and names its most commented element', async () => {
    renderSection();
    const picker = await within(section()).findByRole('combobox', { name: 'Design' });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Shady corner, 3 comments', 'Open lawn, 1 comment']);
    expect(
      await within(section()).findByText('Bench, south-west drew 2 move comments'),
    ).toBeVisible();
  });

  it('counts the design by element kind and by comment kind, with n in each table', async () => {
    renderSection();
    const byElement = await screen.findByRole('table', { name: 'Comments by element kind' });
    const rows = within(byElement).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(['Items2', 'Paths0', 'Areas1']);
    const byKind = screen.getByRole('table', { name: 'Comments by kind' });
    expect(within(byKind).getByRole('row', { name: /Move/ })).toHaveTextContent('2');
  });
});

describe('ElementFeedbackSection actions', () => {
  it('marks a comment resolved with the reply and refetches', async () => {
    const api = renderSection();
    const first = await screen.findByRole('article', { name: /Face the playground/ });
    await userEvent.type(within(first).getByRole('textbox', { name: 'Reply (optional)' }), 'Done');
    await userEvent.click(within(first).getByRole('button', { name: 'Mark resolved' }));
    expect(api.resolveComment).toHaveBeenCalledWith('c1', 'Done');
    await waitFor(() => {
      expect(api.listComments).toHaveBeenCalledTimes(2);
    });
  });

  it('hides a comment', async () => {
    const api = renderSection();
    const first = await screen.findByRole('article', { name: /Face the playground/ });
    await userEvent.click(within(first).getByRole('button', { name: 'Hide' }));
    expect(api.hideComment).toHaveBeenCalledWith('c1', { hidden: true });
  });
});

describe('ElementFeedbackSection map and export', () => {
  it('marks the most commented elements on the plan, with a table alternative', async () => {
    renderSection();
    const map = await screen.findByRole('img', { name: /^Drawing of Shady corner/ });
    expect(map).toBeVisible();
    const marks = within(section()).getByRole('table', { name: 'Most commented elements' });
    const rows = within(marks).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '1Bench, south-west2',
      '2Lawn, south-east1',
    ]);
  });

  it('links the comment CSV beside the section', async () => {
    renderSection();
    const link = await within(section()).findByRole('link', { name: 'Download comments (CSV)' });
    expect(link).toHaveAttribute(
      'href',
      `${TEST_API_URL}/projects/jrp/insights/element-comments.csv`,
    );
  });
});
