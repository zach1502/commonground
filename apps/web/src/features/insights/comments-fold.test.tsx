import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Insights } from '../../api/staff-api';
import { messages } from '../../messages';
import fixture from '../../test/insights-fixture.json' with { type: 'json' };

import { CommentsFold } from './comments-fold';

const INSIGHTS = fixture as Insights;
const text = messages.insights.comments;

describe('CommentsFold', () => {
  it('counts the comments in its closed summary', () => {
    render(<CommentsFold comments={INSIGHTS.comments} />);
    const fold = screen.getByText('2 comments');
    expect(fold.tagName).toBe('SUMMARY');
    expect(fold.closest('details')).not.toHaveAttribute('open');
  });

  it('lists each comment under its design with the voter name and their words', async () => {
    render(<CommentsFold comments={INSIGHTS.comments} />);
    await userEvent.click(screen.getByText('2 comments'));
    const design = screen.getByRole('heading', { name: 'Shady loop' });
    const list = screen.getByRole('list', { name: 'Shady loop' });
    expect(design).toBeVisible();
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Molly SwingsetKeep the garden plots by the lane.',
      'Kevin KickaboutRoom for a pickup game.',
    ]);
  });

  it('says one comment in the singular, and shows the empty line when there are none', async () => {
    const one = {
      total: 1,
      byDesign: [
        {
          ...INSIGHTS.comments.byDesign[0],
          comments: [INSIGHTS.comments.byDesign[0]?.comments[0]],
        },
      ],
    } as Insights['comments'];
    const { rerender } = render(<CommentsFold comments={one} />);
    expect(screen.getByText('1 comment')).toBeInTheDocument();
    rerender(<CommentsFold comments={{ total: 0, byDesign: [] }} />);
    await userEvent.click(screen.getByText('0 comments'));
    expect(screen.getByText(text.empty)).toBeVisible();
  });
});
