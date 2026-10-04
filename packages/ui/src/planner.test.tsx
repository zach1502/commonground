import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FieldInput, FieldWithHelp } from './field-with-help.js';
import { LockToggle } from './lock-toggle.js';
import { NavigationProvider } from './navigation.js';
import { SourceBadge } from './source-badge.js';
import { Stepper } from './stepper.js';

const STEPS = [
  { id: 'site', label: 'Pick the park', href: '/staff/projects/new/site' },
  { id: 'terrain', label: 'Load terrain', href: '/staff/projects/new/terrain' },
  { id: 'review', label: 'Review features', href: '/staff/projects/new/review' },
];

describe('Stepper', () => {
  it('lists every step and marks the current one', () => {
    render(
      <Stepper
        label="Setup steps"
        steps={STEPS}
        currentId="terrain"
        doneIds={['site']}
        doneText="Done"
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Setup steps' });
    expect(nav.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('Load terrain').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});

describe('Stepper states', () => {
  it('gives each of the three states more than a colour to tell it apart', () => {
    render(
      <Stepper
        label="Setup steps"
        steps={STEPS}
        currentId="terrain"
        doneIds={['site']}
        doneText="Done"
      />,
    );
    const [done, current, todo] = [...document.querySelectorAll('li')];
    // Done: a 16 px check in a link back.
    expect(done).toHaveClass('ps-stepper__step--done');
    expect(done?.querySelector('a svg')).toHaveAttribute('width', '16');
    expect(done?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Current: marked for screen readers and bold with the 2 px edge, from its class; no check.
    expect(current).toHaveClass('ps-stepper__step--current');
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current?.querySelector('svg')).toBeNull();
    // Not reached: plain text, no link, no check.
    expect(todo).toHaveClass('ps-stepper__step--todo');
    expect(todo?.querySelector('a, svg')).toBeNull();
  });

  it('links done steps so you can go back, and leaves later steps unlinked', async () => {
    const navigate = vi.fn();
    render(
      <NavigationProvider navigate={navigate}>
        <Stepper
          label="Setup steps"
          steps={STEPS}
          currentId="terrain"
          doneIds={['site']}
          doneText="Done"
        />
      </NavigationProvider>,
    );
    const back = screen.getByRole('link', { name: /Pick the park/ });
    expect(back).toHaveAccessibleName('Pick the park Done');
    await userEvent.click(back);
    expect(navigate).toHaveBeenCalledWith('/staff/projects/new/site');
    expect(screen.queryByRole('link', { name: /Review features/ })).toBeNull();
  });
});

function renderField(error?: string) {
  return render(
    <FieldWithHelp
      id="canopy"
      label="Tree canopy minimum"
      help="Share of the park under tree crowns."
      defaultNote="Default: 30% (Vancouver Urban Forest Strategy target)"
      error={error}
    >
      {(control) => <FieldInput {...control} type="number" defaultValue="30" />}
    </FieldWithHelp>,
  );
}

describe('FieldWithHelp', () => {
  it('puts the label above the field and the help and default below it', () => {
    renderField();
    const input = screen.getByRole('spinbutton', { name: 'Tree canopy minimum' });
    expect(input).toHaveAccessibleDescription(
      'Share of the park under tree crowns. Default: 30% (Vancouver Urban Forest Strategy target)',
    );
    const label = screen.getByText('Tree canopy minimum');
    expect(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const help = screen.getByText('Share of the park under tree crowns.');
    expect(input.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('FieldWithHelp hint and units', () => {
  it('keeps the help and the default on one hint line below the field', () => {
    renderField();
    const help = screen.getByText('Share of the park under tree crowns.');
    const note = screen.getByText('Default: 30% (Vancouver Urban Forest Strategy target)');
    expect(help.parentElement).toBe(note.parentElement);
    expect(help.parentElement).toHaveClass('ps-field__hint');
  });

  it('wraps a money field in a "$" prefix and sizes it to its content', () => {
    render(
      <FieldWithHelp id="budget" label="Budget" help="Total spend." prefix="$" size="money">
        {(control) => <FieldInput {...control} defaultValue="500,000" />}
      </FieldWithHelp>,
    );
    const input = screen.getByRole('textbox', { name: 'Budget' });
    expect(input.closest('.ps-field__row')).toHaveClass('ps-field__row--money');
    expect(screen.getByText('$')).toHaveAttribute('aria-hidden', 'true');
    expect(input).not.toHaveAttribute('placeholder');
  });

  it('puts a unit suffix after a short number field', () => {
    render(
      <FieldWithHelp id="slope" label="Running slope, %" help="Steepest grade." suffix="%">
        {(control) => <FieldInput {...control} defaultValue="5" />}
      </FieldWithHelp>,
    );
    const input = screen.getByRole('textbox', { name: 'Running slope, %' });
    expect(input.closest('.ps-field__row')).toHaveClass('ps-field__row--short');
    expect(input.nextElementSibling).toHaveTextContent('%');
  });

  it('shows an error inline next to the field and marks it invalid', () => {
    renderField('Enter a number from 0 to 100.');
    const input = screen.getByRole('spinbutton', { name: 'Tree canopy minimum' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/^Enter a number from 0 to 100\./);
  });
});

describe('LockToggle', () => {
  it('shows the lock state and reports the other state when pressed', async () => {
    const onChange = vi.fn();
    render(
      <LockToggle
        state="unlocked"
        label="Lock Western red cedar"
        text="Lock"
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Lock Western red cedar' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveTextContent('Lock');
    expect(toggle).toHaveClass('ps-switch');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('locked');
  });

  it('unlocks a locked item', async () => {
    const onChange = vi.fn();
    render(<LockToggle state="locked" label="Lock tree" text="Lock" onChange={onChange} />);
    const toggle = screen.getByRole('button', { name: 'Lock tree' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('unlocked');
  });
});

describe('SourceBadge', () => {
  it('names the source and dataset as plain small text, not a badge', () => {
    render(<SourceBadge source="Vancouver Open Data" dataset="public-trees" />);
    const source = screen.getByText('Vancouver Open Data, public-trees');
    expect(source).toHaveClass('ps-source__name');
    expect(source).not.toHaveClass('ps-badge');
  });

  it('adds a note for data a planner must check', () => {
    render(<SourceBadge source="OpenStreetMap" dataset="overpass" note="Check first" />);
    expect(screen.getByText('OpenStreetMap, overpass')).toBeInTheDocument();
    expect(screen.getByText('Check first')).toBeInTheDocument();
  });
});
