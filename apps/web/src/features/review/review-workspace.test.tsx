import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';
import { ELEMENT_COMMENT_MAX_CHARS, FakeClock } from '@parkshape/core';
import type { ReviewLayerProps } from '@parkshape/scene/viewer';

import type { User } from '../../api/web-api';
import { TEST_NOW } from '../../test/api-server';
import {
  commentOf,
  mockReviewApi,
  MOLLY,
  MOLLY_OWN,
  REVIEW_DESIGN,
  REVIEW_PROJECT,
} from '../../test/review-fixtures';

import { ReviewWorkspace } from './review-workspace';

/** Stands in for the 3D viewer: the chip names, the selection and a tap on the path. */
function FakeStage({ review }: { readonly review: ReviewLayerProps }) {
  return (
    <div>
      <p data-testid="selected">{review.selected?.elementId ?? 'none'}</p>
      <p data-testid="frames">{review.frameRequest}</p>
      <ul aria-label="chips">
        {[...review.counts.entries()].map(([elementId, count]) => (
          <li key={elementId}>{review.chipLabel(elementId, count)}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          review.onSelect(
            { elementId: 'path-1' as never, elementKind: 'path' },
            { x: 40, y: 80.5 },
          );
        }}
      >
        tap path
      </button>
    </div>
  );
}

function chipNames(): string[] {
  const chips = within(screen.getByRole('list', { name: 'chips' })).queryAllByRole('listitem');
  return chips.map((chip) => chip.textContent);
}

function renderWorkspace(
  api = mockReviewApi(),
  user: User | null = MOLLY,
  project = REVIEW_PROJECT,
) {
  render(
    <ReviewWorkspace
      design={REVIEW_DESIGN}
      project={project}
      user={user}
      api={api}
      clock={new FakeClock(TEST_NOW)}
      stage={(review) => <FakeStage review={review} />}
    />,
  );
  return api;
}

const elements = () => screen.getByRole('navigation', { name: 'Elements' });
const benchRow = async () => within(elements()).findByRole('button', { name: /^Bench, / });

describe('Elements list', () => {
  it('lists every element by kind with its comment count', async () => {
    renderWorkspace(mockReviewApi([commentOf(), commentOf({ id: 'c2', kind: 'move' })]));
    const list = elements();
    expect(
      await within(list).findByRole('button', { name: /^Bench, .*, 2 comments$/ }),
    ).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Items' })).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Paths' })).toBeVisible();
    expect(within(list).getByRole('heading', { name: 'Areas' })).toBeVisible();
    expect(
      within(list).getByRole('button', { name: /^Bigleaf maple, .*, 0 comments$/ }),
    ).toBeVisible();
    expect(
      within(list).getByRole('button', { name: /^Gravel path, .*, 0 comments$/ }),
    ).toBeVisible();
    expect(within(list).getByRole('button', { name: /^Lawn, .*, 0 comments$/ })).toBeVisible();
  });

  it('selects the element in the scene and opens the composer from the keyboard', async () => {
    renderWorkspace();
    const row = await benchRow();
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('selected')).toHaveTextContent('bench-1');
    expect(screen.getByTestId('frames')).toHaveTextContent('1');
    const composer = screen.getByRole('region', { name: /^Bench, / });
    expect(within(composer).getByRole('heading', { level: 2 })).toHaveFocus();
  });
});

async function openBench() {
  await userEvent.click(await benchRow());
  return screen.getByRole('region', { name: /^Bench, / });
}

describe('Comment composer', () => {
  it('offers the five kinds as one choice, a labelled note and a live count', async () => {
    renderWorkspace();
    const composer = await openBench();
    const kinds = within(composer).getByRole('group', { name: 'Your comment' });
    const radios = within(kinds).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'keep',
      'move',
      'change',
      'remove',
      'question',
    ]);
    await userEvent.click(within(kinds).getByRole('radio', { name: 'Move' }));
    await userEvent.click(within(kinds).getByRole('radio', { name: 'Keep' }));
    expect(within(kinds).getAllByRole('radio', { checked: true })).toHaveLength(1);
    const note = within(composer).getByRole('textbox', { name: 'Add a note (optional)' });
    expect(note).toHaveAttribute('maxlength', String(ELEMENT_COMMENT_MAX_CHARS));
    expect(within(composer).getByText('0 of 280 characters')).toBeVisible();
    await userEvent.type(note, 'Shade');
    expect(within(composer).getByText('5 of 280 characters')).toBeVisible();
    expect(within(composer).getAllByRole('button', { name: 'Add comment' })).toHaveLength(1);
  });

  it('asks for a kind before it sends', async () => {
    const api = renderWorkspace();
    const composer = await openBench();
    await userEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));
    expect(api.addComment).not.toHaveBeenCalled();
    expect(within(composer).getByRole('alert')).toHaveTextContent(
      'No kind is picked. Pick one to add your comment.',
    );
  });

  it('adds the comment, lists it under the element and counts it on the chip', async () => {
    const api = renderWorkspace();
    const composer = await openBench();
    await userEvent.click(within(composer).getByRole('radio', { name: 'Move' }));
    await userEvent.type(within(composer).getByRole('textbox'), 'Face the playground');
    await userEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));
    expect(api.addComment).toHaveBeenCalledWith('d1', {
      elementId: 'bench-1',
      kind: 'move',
      text: 'Face the playground',
    });
    expect(await within(composer).findByText('Face the playground')).toBeVisible();
    expect(within(composer).getByRole('status')).toHaveTextContent(/^Comment added on Bench, /);
    await waitFor(() => {
      expect(chipNames()).toEqual(['1 comment on Bench']);
    });
    expect(await benchRow()).toHaveAccessibleName(/1 comment$/);
  });
});

describe('Comment composer sending', () => {
  it('sends the tap point for a path picked in the scene', async () => {
    const api = renderWorkspace();
    await userEvent.click(await screen.findByRole('button', { name: 'tap path' }));
    const composer = screen.getByRole('region', { name: /^Gravel path, / });
    await userEvent.click(within(composer).getByRole('radio', { name: 'Keep' }));
    await userEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));
    expect(api.addComment).toHaveBeenCalledWith('d1', {
      elementId: 'path-1',
      kind: 'keep',
      text: '',
      surfacePoint: { x: 40, y: 80.5 },
    });
  });

  it('keeps the text and fires one alert when the project closed as it sent', async () => {
    const api = mockReviewApi();
    api.addComment.mockRejectedValueOnce(new ApiRequestError(409, 'phase-closed', 'Closed'));
    renderWorkspace(api);
    const composer = await openBench();
    await userEvent.click(within(composer).getByRole('radio', { name: 'Remove' }));
    await userEvent.type(within(composer).getByRole('textbox'), 'Too close to the gate');
    await userEvent.click(within(composer).getByRole('button', { name: 'Add comment' }));
    const alerts = await within(composer).findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(
      'Commenting closed on 31 October 2026. Your comment was not sent.',
    );
    expect(within(composer).getByRole('textbox')).toHaveValue('Too close to the gate');
  });
});

describe('Comment composer closing and access', () => {
  it('closes on Escape and returns focus to the row that opened it', async () => {
    renderWorkspace();
    const row = await benchRow();
    await userEvent.click(row);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: /^Bench, / })).not.toBeInTheDocument();
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
    expect(row).toHaveFocus();
  });

  it('closes on Cancel as well', async () => {
    renderWorkspace();
    const composer = await openBench();
    await userEvent.click(within(composer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: /^Bench, / })).not.toBeInTheDocument();
    expect(await benchRow()).toHaveFocus();
  });

  it('asks a visitor to sign in in place of the form', async () => {
    renderWorkspace(mockReviewApi(), null);
    const composer = await openBench();
    expect(within(composer).getByRole('link', { name: 'Sign in to comment' })).toBeVisible();
    expect(within(composer).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the closing day and no form once the project is closed', async () => {
    renderWorkspace(mockReviewApi(), MOLLY, { ...REVIEW_PROJECT, phase: 'closed' });
    const composer = await openBench();
    expect(within(composer).getByText('Commenting closed on 31 October 2026.')).toBeVisible();
    expect(within(composer).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('edits your own comment in the composer', async () => {
    const api = renderWorkspace(mockReviewApi([commentOf({ ...MOLLY_OWN, text: 'Closer' })]));
    const composer = await openBench();
    await userEvent.click(within(composer).getByRole('button', { name: 'Edit' }));
    const note = within(composer).getByRole('textbox');
    expect(note).toHaveValue('Closer');
    await userEvent.type(note, ' to the swings');
    await userEvent.click(within(composer).getByRole('button', { name: 'Save comment' }));
    expect(api.editComment).toHaveBeenCalledWith('c1', { text: 'Closer to the swings' });
    expect(await within(composer).findByText('Closer to the swings')).toBeVisible();
  });

  it('keeps the composer copy within the decision screen budget of 25 words', async () => {
    renderWorkspace();
    const composer = await openBench();
    const copy = composer.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-kind="data"], label, legend').forEach((node) => {
      node.remove();
    });
    const words = copy.textContent.split(/\s+/).filter((word) => /[a-z]/i.test(word));
    expect(words.length).toBeLessThanOrEqual(DECISION_WORDS);
  });
});

const DECISION_WORDS = 25;
