import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { messages } from '../messages';

import { ParametersStep } from './step-parameters';
import { WizardProvider } from './wizard-context';
import { loadWizard } from './wizard-state';
import { stepHref } from './wizard-steps';

const text = messages.planner.parameters.closesAt;

function renderStep() {
  const router = createMemoryRouter(
    [
      {
        path: stepHref('parameters'),
        element: (
          <WizardProvider storage={window.sessionStorage}>
            <ParametersStep />
          </WizardProvider>
        ),
      },
      { path: stepHref('refine'), element: <p>refine</p> },
    ],
    { initialEntries: [stepHref('parameters')] },
  );
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup({ delay: null }) };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('parameters step closing day', () => {
  it('asks for the last day to design and vote in a date field with a one-line reason', () => {
    renderStep();
    const field = screen.getByLabelText(text.label);
    expect(field).toHaveAttribute('type', 'date');
    expect(field).toHaveValue('');
    expect(field).toHaveAccessibleDescription(text.help);
    const more = screen.getByText(messages.planner.parameters.more).closest('details');
    expect(more?.contains(field)).toBe(false);
  });

  it('saves the chosen day with the rules and moves on', async () => {
    const { router, user } = renderStep();
    fireEvent.change(screen.getByLabelText(text.label), { target: { value: '2026-10-31' } });
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    expect(router.state.location.pathname).toBe(stepHref('refine'));
    expect(loadWizard(window.sessionStorage).closesAt).toBe('2026-10-31');
  });
});
