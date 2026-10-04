import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VOTE_COMMENT_MAX_CHARS } from '@parkshape/core';

import { format, messages } from '../messages';

import { YourVoteEditor, type YourVoteEditorProps } from './your-vote-editor';

const text = messages.voteChange;
const count = (value: number) =>
  format(text.commentCount, { count: value, max: VOTE_COMMENT_MAX_CHARS });

function renderEditor(props: Partial<YourVoteEditorProps> = {}) {
  const handlers = { onSave: vi.fn(), onCancel: vi.fn() };
  render(
    <YourVoteEditor
      initial={{ choice: 'up', reasons: ['trees'], comment: 'Shade by the gate' }}
      isBlocked={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const choice = (name: string) =>
  within(screen.getByRole('group', { name: text.choiceLabel })).getByRole('button', { name });

describe('YourVoteEditor', () => {
  it('opens on the stored vote with its heading focused', () => {
    renderEditor();
    expect(screen.getByRole('heading', { name: text.heading })).toHaveFocus();
    expect(choice(messages.vote.up)).toHaveAttribute('aria-pressed', 'true');
    expect(choice(messages.vote.down)).toHaveAttribute('aria-pressed', 'false');
    expect(choice(messages.vote.skip)).toHaveAttribute('aria-pressed', 'false');
    const trees = screen.getByRole('button', { name: messages.vote.reasons.trees });
    expect(trees).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: text.commentLabel })).toHaveValue(
      'Shade by the gate',
    );
  });

  it('labels the comment box, caps it at 500 characters and counts as the voter types', async () => {
    renderEditor({ initial: { choice: 'down', reasons: [], comment: '' } });
    const box = screen.getByRole('textbox', { name: text.commentLabel });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box).toHaveAttribute('maxLength', String(VOTE_COMMENT_MAX_CHARS));
    expect(box).toHaveAccessibleDescription(count(0));
    await userEvent.type(box, 'Too paved');
    expect(screen.getByText(count('Too paved'.length))).toBeVisible();
  });

  it('saves the new direction, the reasons in chip order and the trimmed comment', async () => {
    const { onSave } = renderEditor();
    await userEvent.click(choice(messages.vote.down));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons['too-paved'] }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons.play }));
    await userEvent.click(screen.getByRole('button', { name: messages.vote.reasons.trees }));
    const box = screen.getByRole('textbox', { name: text.commentLabel });
    await userEvent.clear(box);
    await userEvent.type(box, '  Needs more grass.  ');
    await userEvent.click(screen.getByRole('button', { name: text.save }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      choice: 'down',
      reasons: ['play', 'too-paved'],
      comment: 'Needs more grass.',
    });
  });
});

describe('YourVoteEditor actions', () => {
  it('hides the reasons and comment on Skip, and saves a skip with neither', async () => {
    const { onSave } = renderEditor();
    await userEvent.click(choice(messages.vote.skip));
    expect(screen.queryByRole('textbox', { name: text.commentLabel })).toBeNull();
    expect(screen.queryByRole('button', { name: messages.vote.reasons.trees })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: text.save }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ choice: 'skip', reasons: [], comment: '' });
  });

  it('keeps the vote on Keep my vote and on Escape', async () => {
    const { onCancel, onSave } = renderEditor();
    await userEvent.click(screen.getByRole('button', { name: text.keep }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: text.commentLabel }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('works from the keyboard alone, Save vote being the one filled button', async () => {
    const { onSave } = renderEditor({ initial: { choice: 'up', reasons: [], comment: '' } });
    await userEvent.tab();
    expect(choice(messages.vote.up)).toHaveFocus();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(choice(messages.vote.down)).toHaveAttribute('aria-pressed', 'true');
    const primary = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('data-variant') === 'primary');
    expect(primary.map((button) => button.textContent)).toEqual([text.save]);
    screen.getByRole('button', { name: text.save }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith({ choice: 'down', reasons: [], comment: '' });
  });

  it('offers Withdraw vote only when the caller passes it, and disables saving while blocked', async () => {
    const onWithdraw = vi.fn();
    const { rerender } = render(
      <YourVoteEditor
        initial={{ choice: 'up', reasons: [], comment: '' }}
        isBlocked
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: text.withdraw })).toBeNull();
    expect(screen.getByRole('button', { name: text.save })).toBeDisabled();
    rerender(
      <YourVoteEditor
        initial={{ choice: 'up', reasons: [], comment: '' }}
        isBlocked={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onWithdraw={onWithdraw}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: text.withdraw }));
    expect(onWithdraw).toHaveBeenCalledOnce();
  });
});
