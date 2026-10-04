import { readFileSync } from 'node:fs';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProgressCount } from './progress-count.js';
import { RankChange } from './rank-change.js';
import { VoteButtons } from './vote-buttons.js';

const VOTE_CSS = readFileSync(`${import.meta.dirname}/vote.css`, 'utf8');

function renderButtons(overrides: Partial<Parameters<typeof VoteButtons>[0]> = {}) {
  const handlers = { onUp: vi.fn(), onDown: vi.fn(), onSkip: vi.fn() };
  render(
    <VoteButtons
      upLabel="Vote up"
      downLabel="Vote down"
      skipLabel="Skip"
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('VoteButtons', () => {
  it('calls the matching handler for each button', async () => {
    const handlers = renderButtons();
    await userEvent.click(screen.getByRole('button', { name: 'Vote up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vote down' }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(handlers.onUp).toHaveBeenCalledOnce();
    expect(handlers.onDown).toHaveBeenCalledOnce();
    expect(handlers.onSkip).toHaveBeenCalledOnce();
  });

  it('marks up as the one primary action', () => {
    renderButtons();
    expect(screen.getByRole('button', { name: 'Vote up' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('draws vote down as secondary, so the choice never reads as an error', () => {
    renderButtons();
    expect(screen.getByRole('button', { name: 'Vote down' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });

  it('keeps the DOM order skip, down, up inside the vote buttons group', () => {
    renderButtons();
    const group = screen.getByRole('button', { name: 'Skip' }).parentElement;
    expect(group).toHaveClass('ps-vote-buttons');
    const names = [...(group?.querySelectorAll('button') ?? [])].map(
      (button) => button.textContent,
    );
    expect(names).toEqual(['Skip', 'Vote down', 'Vote up']);
  });

  it('sizes the buttons to their labels at the left from 1024 px, the editor breakpoint', () => {
    const desktop = VOTE_CSS.slice(VOTE_CSS.indexOf('@media (min-width: 1024px)'));
    expect(desktop).toMatch(
      /\.ps-vote-buttons \{[^}]*display: flex;[^}]*justify-content: flex-start;/,
    );
    expect(desktop).toMatch(
      /\.ps-vote-buttons \.bcds-react-aria-Button\.medium \{[^}]*width: auto;/,
    );
  });

  it('does not fire when disabled', async () => {
    const handlers = renderButtons({ isDisabled: true });
    await userEvent.click(screen.getByRole('button', { name: 'Vote up' }));
    expect(handlers.onUp).not.toHaveBeenCalled();
  });
});

describe('ProgressCount', () => {
  it('renders the label as a polite status', () => {
    render(<ProgressCount label="3 of 5" current={3} total={5} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 of 5');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('RankChange', () => {
  it('shows a text alternative for each direction', () => {
    const { rerender } = render(<RankChange direction="up" label="up 2" />);
    expect(screen.getByText('up 2')).toHaveClass('ps-visually-hidden');
    rerender(<RankChange direction="same" label="no change" />);
    expect(screen.getByText('no change')).toBeInTheDocument();
  });
});

describe('VoteButtons held vote (J15)', () => {
  it.each([
    ['up', 'Vote up'],
    ['down', 'Vote down'],
  ] as const)('holds the pressed state on %s once it is cast', (chosen, name) => {
    renderButtons({ chosen });
    expect(screen.getByRole('button', { name })).toHaveAttribute('data-held', 'true');
    const others = screen.getAllByRole('button').filter((button) => button.textContent !== name);
    others.forEach((button) => {
      expect(button).not.toHaveAttribute('data-held');
    });
  });

  it('holds nothing before a vote', () => {
    renderButtons();
    screen.getAllByRole('button').forEach((button) => {
      expect(button).not.toHaveAttribute('data-held');
    });
  });
});
