import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { COMMENT_EDIT_WINDOW_MS } from '@parkshape/core';

import { TEST_NOW } from '../../test/api-server';
import { commentOf, GAIL, MOLLY_OWN } from '../../test/review-fixtures';

import { CommentList } from './comment-list';

const ONE_MINUTE_MS = 60_000;

function renderList(comments = [commentOf()], phase: 'open' | 'closed' = 'open') {
  const onEdit = vi.fn();
  render(<CommentList comments={comments} now={TEST_NOW} phase={phase} onEdit={onEdit} />);
  return onEdit;
}

describe('CommentList', () => {
  it('shows the author, the kind, the text and how long ago, from the clock', () => {
    renderList();
    const item = screen.getByRole('listitem');
    expect(within(item).getByText(GAIL.displayName)).toBeVisible();
    expect(within(item).getByText('Keep')).toBeVisible();
    expect(within(item).getByText('Good spot for shade')).toBeVisible();
    expect(within(item).getByText('5 minutes ago')).toBeVisible();
    expect(within(item).getByText('5 minutes ago').closest('time')).toHaveAttribute(
      'datetime',
      commentOf().createdAt,
    );
  });

  it('marks a resolved comment and shows the planner reply, with no action on it', () => {
    renderList([
      commentOf({
        status: 'resolved',
        plannerReply: { text: 'Moved in the next draft', repliedAt: TEST_NOW.toISOString() },
      }),
    ]);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Resolved')).toBeVisible();
    expect(within(item).getByText('Planner reply')).toBeVisible();
    expect(within(item).getByText('Moved in the next draft')).toBeVisible();
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers Edit on your own comment inside the edit window', async () => {
    const own = commentOf({ ...MOLLY_OWN });
    const onEdit = renderList([own]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(own);
  });

  it("offers no Edit on someone else's comment", () => {
    renderList([commentOf()]);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('offers no Edit once the window has passed', () => {
    const late = new Date(TEST_NOW.getTime() - COMMENT_EDIT_WINDOW_MS - ONE_MINUTE_MS);
    renderList([
      commentOf({
        ...MOLLY_OWN,
        createdAt: late.toISOString(),
      }),
    ]);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('offers no Edit once the project is closed', () => {
    renderList([commentOf({ ...MOLLY_OWN })], 'closed');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
