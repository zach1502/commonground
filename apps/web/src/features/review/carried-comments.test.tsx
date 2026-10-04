import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { messages } from '../../messages';
import { TEST_NOW } from '../../test/api-server';
import { commentOf, MOLLY, REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

import type { DesignComments, ReviewApi, ReviewComment } from './review-api';
import { ReviewWorkspace } from './review-workspace';

const NO_COUNTS = { keep: 0, move: 0, change: 0, remove: 0, question: 0 };
const LAST_VERSION = 'd0';

function listed(designId: string, comments: readonly ReviewComment[]): DesignComments {
  return {
    designId,
    commenting: 'open',
    elements: comments.map((comment) => ({
      elementId: comment.elementId,
      elementKind: comment.elementKind,
      category: comment.category,
      label: comment.elementId,
      counts: NO_COUNTS,
      openCount: 1,
      comments: [comment],
    })),
  };
}

/** The last version has an open bench comment, a resolved one and one on a removed bench. */
const PREVIOUS = [
  commentOf({ id: 'p1', designId: LAST_VERSION, text: 'Turn it to face the swings', mine: true }),
  commentOf({ id: 'p2', designId: LAST_VERSION, elementId: 'maple-1', status: 'resolved' }),
  commentOf({ id: 'p3', designId: LAST_VERSION, elementId: 'bench-9', text: 'Gone now' }),
].map((comment) => ({ ...comment, editable: true }));

function renderVersion(versionOf: string | null) {
  const api: ReviewApi = {
    listComments: vi.fn(async (designId: string) =>
      Promise.resolve(listed(designId, designId === LAST_VERSION ? PREVIOUS : [])),
    ),
    addComment: vi.fn(),
    editComment: vi.fn(),
  };
  render(
    <ReviewWorkspace
      design={{ ...REVIEW_DESIGN, versionOf }}
      project={REVIEW_PROJECT}
      user={MOLLY}
      api={api}
      clock={new FakeClock(TEST_NOW)}
      stage={() => null}
    />,
  );
  return api;
}

async function openBench() {
  const elements = screen.getByRole('navigation', { name: messages.review.list.heading });
  await userEvent.click(await within(elements).findByRole('button', { name: /^Bench, / }));
}

describe('On the last version', () => {
  it('lists the last version open comments on the selected element, read only', async () => {
    renderVersion(LAST_VERSION);
    await openBench();
    const section = await screen.findByRole('region', { name: messages.review.lastVersion });
    expect(within(section).getByText('Turn it to face the swings')).toBeVisible();
    expect(
      within(section).queryByRole('button', { name: messages.review.comments.edit }),
    ).toBeNull();
    expect(screen.queryByText('Gone now')).toBeNull();
  });

  it('reads no last version for a first version', async () => {
    const api = renderVersion(null);
    await openBench();
    expect(api.listComments).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: messages.review.lastVersion })).toBeNull();
  });
});
