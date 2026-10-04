import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';
import { PROGRESS_DELAY_MS } from '@parkshape/ui';

import type { SubmitOutcome } from '../api/web-api';
import { messages } from '../messages';

import { SubmitDialog } from './submit-dialog';

function setup(outcome: SubmitOutcome) {
  const onSubmit = vi.fn<() => Promise<SubmitOutcome>>().mockResolvedValue(outcome);
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<SubmitDialog onSubmit={onSubmit} onSuccess={onSuccess} onClose={onClose} />);
  return { onSubmit, onSuccess, onClose };
}

describe('SubmitDialog', () => {
  it('shows the lifecycle rules as a list and one primary action', () => {
    const { container } = render(
      <SubmitDialog onSubmit={vi.fn()} onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog', { name: messages.submit.title });
    expect(
      within(dialog)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual([messages.submit.title]);
    // The dialog title is the only heading; no bold line repeats it above the rules.
    expect(within(dialog).queryByText('Before you submit')).not.toBeInTheDocument();
    const rules = within(dialog).getByRole('list');
    expect(
      within(rules)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(Object.values(messages.submit.rules));
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });

  it('goes to the design page when the design is accepted', async () => {
    const { onSuccess } = setup({ kind: 'submitted', softWarnings: [] });
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks on hard failures and lists the server messages', async () => {
    const { onSuccess } = setup({
      kind: 'blocked',
      hardFailures: [{ key: 'requiredFeatures', message: 'The garden fits 18 plots. Add more.' }],
      softWarnings: [],
    });
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    expect(await screen.findByText('The garden fits 18 plots. Add more.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('badges soft warnings without blocking', async () => {
    setup({
      kind: 'blocked',
      hardFailures: [{ key: 'canopy', message: 'Add trees.' }],
      softWarnings: [{ key: 'budget', message: 'A little over.', badge: 'Over budget 12%' }],
    });
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    expect(await screen.findByText('Over budget 12%')).toBeInTheDocument();
  });

  it('surfaces the live cap message', async () => {
    setup({ kind: 'capReached', message: 'You have 3 live designs, the most allowed.' });
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    expect(
      await screen.findByText('You have 3 live designs, the most allowed.'),
    ).toBeInTheDocument();
  });
});

describe('SubmitDialog failures', () => {
  function setupThrowing(error: unknown) {
    const onSubmit = vi.fn<() => Promise<SubmitOutcome>>().mockRejectedValue(error);
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<SubmitDialog onSubmit={onSubmit} onSuccess={onSuccess} onClose={onClose} />);
    return { onSubmit, onSuccess, onClose };
  }

  it('shows the design-too-large fact on a 413 and keeps the retry usable', async () => {
    const { onSubmit } = setupThrowing(new ApiRequestError(413, 'payload-too-large', 'too big'));
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.failure.designTooLarge);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('button', { name: messages.submit.action })).toBeEnabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the changed-during-submit fact on a 409 wrong-status', async () => {
    setupThrowing(new ApiRequestError(409, 'wrong-status', 'changed'));
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.failure.changedDuringSubmit,
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('SubmitDialog as a modal', () => {
  it('is a modal dialog that keeps focus inside and closes on Escape', async () => {
    const { onClose } = setup({ kind: 'submitted', softWarnings: [] });
    const dialog = screen.getByRole('dialog', { name: messages.submit.title });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: messages.submit.cancel })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: messages.submit.action })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: messages.submit.cancel })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('SubmitDialog progress and success (J21)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the progress bar only once the submit has waited 1 s', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onSubmit = vi
      .fn<() => Promise<SubmitOutcome>>()
      .mockReturnValue(new Promise(() => undefined));
    render(<SubmitDialog onSubmit={onSubmit} onSuccess={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    act(() => {
      vi.advanceTimersByTime(PROGRESS_DELAY_MS - 1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByRole('progressbar', { name: messages.submit.submitting }),
    ).toBeInTheDocument();
  });

  it('shows one success line with the drawn check while the design page opens', async () => {
    const onSuccess = vi.fn().mockReturnValue(new Promise(() => undefined));
    const onSubmit = vi
      .fn<() => Promise<SubmitOutcome>>()
      .mockResolvedValue({ kind: 'submitted', softWarnings: [] });
    const { container } = render(
      <SubmitDialog onSubmit={onSubmit} onSuccess={onSuccess} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: messages.submit.action }));
    expect(await screen.findByText(messages.submitSuccess.line)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.ownerDocument.querySelectorAll('.ps-success-check')).toHaveLength(1);
    expect(container.ownerDocument.querySelector('canvas')).toBeNull();
  });

  it('closes through the dialog exit when the reader keeps editing', async () => {
    const { onClose } = setup({ kind: 'submitted', softWarnings: [] });
    await userEvent.click(screen.getByRole('button', { name: messages.submit.cancel }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
