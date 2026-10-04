import { readFileSync } from 'node:fs';

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOTION_CLASS } from './motion/index.js';
import { ReasonChips, type ReasonChipsProps, type ReasonOption } from './reason-chips.js';

const VOTE_CSS = readFileSync(`${import.meta.dirname}/vote.css`, 'utf8');

const REASONS: readonly ReasonOption[] = [
  { id: 'trees', label: 'More trees' },
  { id: 'paths', label: 'Better paths' },
  { id: 'garden', label: 'Garden' },
];
const HEADING = 'Why?';
const FIVE_SECONDS_MS = 5000;

function renderChips(overrides: Partial<ReasonChipsProps> = {}) {
  const onToggle = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ReasonChips
      heading={HEADING}
      reasons={REASONS}
      selected={new Set()}
      nextLabel="Next"
      skipLabel="Skip reasons"
      onToggle={onToggle}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onToggle, onConfirm };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ReasonChips', () => {
  it('shows a lead line above the question, inside the choices block', () => {
    renderChips({ lead: <p>You voted up.</p> });
    const lead = screen.getByText('You voted up.');
    expect(lead.parentElement).toHaveClass('ps-reason-chips__choices');
    expect(lead.parentElement).toContainElement(screen.getByRole('heading', { name: HEADING }));
  });

  it('reports a chip toggle and reflects the selected set', async () => {
    const { onToggle } = renderChips({ selected: new Set(['trees']) });
    expect(screen.getByRole('button', { name: 'More trees' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Better paths' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Better paths' }));
    expect(onToggle).toHaveBeenCalledWith('paths');
  });

  it('stays open with no timer after 5 s of fake time', () => {
    vi.useFakeTimers();
    const { onConfirm } = renderChips();
    act(() => {
      vi.advanceTimersByTime(FIVE_SECONDS_MS);
    });
    expect(screen.getByRole('region', { name: HEADING })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** The declarations of the first rule whose selector list is exactly the one given. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('ReasonChips chosen state', () => {
  it('marks only a chosen chip with the on class and a 16 px check icon', () => {
    renderChips({ selected: new Set(['trees']) });
    const chosen = screen.getByRole('button', { name: 'More trees' });
    const other = screen.getByRole('button', { name: 'Better paths' });
    expect(chosen).toHaveClass('ps-chip--on');
    expect(other).not.toHaveClass('ps-chip--on');
    const icon = chosen.querySelector('svg');
    expect(icon).toHaveAttribute('width', '16');
    expect(icon).toHaveAttribute('height', '16');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(other.querySelector('svg')).toBeNull();
  });

  it('changes state through the 150 ms motion class', () => {
    renderChips({ selected: new Set(['trees']) });
    for (const chip of screen.getAllByRole('button', { pressed: false })) {
      expect(chip).toHaveClass(MOTION_CLASS.state);
    }
    expect(screen.getByRole('button', { name: 'More trees' })).toHaveClass(MOTION_CLASS.state);
  });

  it('draws the chosen edge 2 px wide in the dark border token, with no blue fill', () => {
    const on = ruleBody(VOTE_CSS, '.ps-chip--on');
    expect(on).toContain('var(--layout-border-width-medium)');
    expect(on).toContain('var(--surface-color-border-dark)');
    expect(on).not.toContain('--status-info');
  });
});

describe('ReasonChips Next and Skip', () => {
  it('confirms the selected reasons, in list order, on Next', async () => {
    const { onConfirm } = renderChips({ selected: new Set(['garden', 'trees']) });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(['trees', 'garden']);
  });

  it('confirms an empty list on Skip reasons, whatever is selected', async () => {
    const { onConfirm } = renderChips({ selected: new Set(['trees']) });
    await userEvent.click(screen.getByRole('button', { name: 'Skip reasons' }));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('confirms with Enter on the focused Next', async () => {
    const { onConfirm } = renderChips({ selected: new Set(['paths']) });
    screen.getByRole('button', { name: 'Next' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(['paths']);
  });

  it('is a region named by its heading, and moves focus to the heading when it opens', () => {
    renderChips();
    const heading = screen.getByRole('heading', { name: HEADING });
    expect(screen.getByRole('region', { name: HEADING })).toContainElement(heading);
    expect(heading).toHaveFocus();
  });

  it('closes like Skip reasons on Escape, whatever is selected', async () => {
    const { onConfirm } = renderChips({ selected: new Set(['trees']) });
    await userEvent.keyboard('{Escape}');
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('opens as a bottom sheet when asked, and inline by default', () => {
    renderChips({ placement: 'sheet' });
    expect(screen.getByRole('region', { name: HEADING })).toHaveClass('ps-reason-chips--sheet');
    cleanup();
    renderChips();
    expect(screen.getByRole('region', { name: HEADING })).not.toHaveClass('ps-reason-chips--sheet');
  });

  it('pins the sheet to the window bottom on a phone, above the page', () => {
    const sheet = ruleBody(VOTE_CSS, '  .ps-reason-chips--sheet');
    expect(sheet).toContain('position: fixed');
    expect(sheet).toContain('inset-block-end: 0');
  });

  it('shows Next as the one primary action and Skip reasons as a bordered secondary button', () => {
    renderChips();
    expect(screen.getByRole('button', { name: 'Next' })).toHaveAttribute('data-variant', 'primary');
    const skip = screen.getByRole('button', { name: 'Skip reasons' });
    expect(skip).toHaveAttribute('data-variant', 'secondary');
    expect(skip).toHaveClass('bcds-react-aria-Button', 'secondary', 'medium');
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });
});

describe('ReasonChips reveal (J15)', () => {
  it('reveals the whole sheet once with the 150 ms reveal class', () => {
    const { container } = render(
      <ReasonChips
        heading="What made you choose that?"
        reasons={[{ id: 'shade', label: 'Shade' }]}
        selected={new Set()}
        nextLabel="Next"
        skipLabel="Skip reasons"
        onToggle={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    const sheet = container.querySelector('section');
    expect(sheet).toHaveClass(MOTION_CLASS.reveal);
    expect(container.querySelectorAll(`.${MOTION_CLASS.reveal}`)).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'What made you choose that?' })).toHaveFocus();
  });
});
