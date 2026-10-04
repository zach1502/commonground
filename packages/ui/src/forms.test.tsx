import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RadioGroup } from './radio-group.js';
import { Select } from './select.js';
import { TextField } from './text-field.js';

describe('TextField', () => {
  it('puts the label above and help text below', () => {
    render(
      <TextField label="Postal code" description="For example V5T" value="" onChange={vi.fn()} />,
    );
    const input = screen.getByRole('textbox', { name: 'Postal code' });
    expect(input).toHaveAccessibleDescription('For example V5T');
  });

  it('shows an inline error and marks the field invalid', () => {
    render(
      <TextField
        label="Postal code"
        value="1"
        onChange={vi.fn()}
        errorMessage="Enter 3 characters"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Postal code' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter 3 characters')).toBeInTheDocument();
  });

  it('reports typed text', async () => {
    const onChange = vi.fn();
    render(<TextField label="Name" value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'V');
    expect(onChange).toHaveBeenCalledWith('V');
  });

  it('hides typed text in a password field', () => {
    render(<TextField label="Access code" value="" onChange={vi.fn()} type="password" />);
    expect(screen.getByLabelText('Access code')).toHaveAttribute('type', 'password');
  });

  it('renders disabled', () => {
    render(<TextField label="Name" value="" onChange={vi.fn()} isDisabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});

const OPTIONS = [
  { id: 'a', label: 'Under 18' },
  { id: 'b', label: '18 to 29' },
];

describe('Select', () => {
  it('renders the label and placeholder', () => {
    render(
      <Select
        label="Age range"
        placeholder="Choose one"
        options={OPTIONS}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Age range/ })).toHaveTextContent('Choose one');
  });

  it('shows the selected option', () => {
    render(<Select label="Age range" options={OPTIONS} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Age range/ })).toHaveTextContent('18 to 29');
  });

  it('reports the chosen option', async () => {
    const onChange = vi.fn();
    render(<Select label="Age range" options={OPTIONS} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Age range/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Under 18' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('shows an inline error', () => {
    render(
      <Select
        label="Age range"
        options={OPTIONS}
        value={null}
        onChange={vi.fn()}
        errorMessage="Choose a range"
      />,
    );
    expect(screen.getByText('Choose a range')).toBeInTheDocument();
  });
});

describe('RadioGroup', () => {
  const people = [
    { value: 'p1', label: 'Bob Walksadog', description: 'Walks his dog.' },
    { value: 'p2', label: 'Molly Swingset' },
  ];

  it('renders every option and the selected value', () => {
    render(<RadioGroup label="Log in as" options={people} value="p2" onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Log in as' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Molly Swingset/ })).toBeChecked();
    expect(screen.getByText('Walks his dog.')).toBeInTheDocument();
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    render(<RadioGroup label="Log in as" options={people} value="p2" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /Bob Walksadog/ }));
    expect(onChange).toHaveBeenCalledWith('p1');
  });
});
