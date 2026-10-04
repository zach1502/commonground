import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { messages } from '../messages';

import { ParametersStep } from './step-parameters';
import { WizardProvider } from './wizard-context';
import { loadWizard } from './wizard-state';
import { stepHref } from './wizard-steps';

const strings = messages.planner.parameters;

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
  // No pause between keystrokes: each pause is a timer turn, which gets slow under load.
  return { router, user: userEvent.setup({ delay: null }) };
}

/**
 * Finding a field by role and name makes jsdom compute every textbox's accessible name, about
 * 150 ms a time on this 25-field form. Each test looks a field up once and keeps the element,
 * which React keeps across re-renders.
 */
const canopyField = () => screen.getByRole('textbox', { name: strings.fields.canopyMin.label });

describe('parameters step', () => {
  it('starts every field at its default with help and the cited default below it', () => {
    renderStep();
    const canopy = canopyField();
    expect(canopy).toHaveValue('30');
    expect(canopy).toHaveAccessibleDescription(
      `${strings.fields.canopyMin.help} ${strings.fields.canopyMin.default}`,
    );
    const label = screen.getByText(strings.fields.canopyMin.label);
    expect(label.compareDocumentPosition(canopy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Default: 30% (Vancouver Urban Forest Strategy target)')).toBeVisible();
    expect(
      screen.getByRole('combobox', { name: strings.severity.keys.requiredFeatures }),
    ).toHaveValue('hard');
  });

  it('shows a range error inline next to its field and stays on the step', async () => {
    const { router, user } = renderStep();
    const canopy = canopyField();
    await user.clear(canopy);
    await user.type(canopy, '140');
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    expect(canopy).toHaveAttribute('aria-invalid', 'true');
    expect(canopy).toHaveAccessibleDescription(/^Enter a number from 0 to 100\./);
    expect(screen.getByText(strings.formError)).toBeVisible();
    expect(router.state.location.pathname).toBe(stepHref('parameters'));
  });

  it('shows a not-a-number error inline next to a count field', async () => {
    const { router, user } = renderStep();
    const fewest = screen.getByRole('textbox', { name: 'Fewest Trees' });
    await user.type(fewest, 'x');
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    expect(fewest).toHaveAccessibleDescription(strings.messages.notNumber);
    expect(router.state.location.pathname).toBe(stepHref('parameters'));
  });
});

describe('parameters step layout', () => {
  it('shows 5 settings before one named disclosure, with money in "$" fields', () => {
    renderStep();
    const more = screen.getByText(strings.more).closest('details');
    const outside = screen
      .getAllByRole('textbox')
      .filter((field) => !(more?.contains(field) ?? false));
    expect(outside).toHaveLength(5);
    const budget = screen.getByRole('textbox', { name: strings.fields.budgetTotal.label });
    expect(budget).toHaveValue('500,000');
    expect(budget.closest('.ps-field__row')).toHaveClass('ps-field__row--money');
    expect(document.querySelector('[placeholder]')).toBeNull();
  });

  it('sums up the chosen rules beside the form', async () => {
    const { user } = renderStep();
    const summary = screen.getByRole('complementary', { name: strings.summaryHeading });
    expect(summary).toHaveTextContent('$500,000');
    expect(summary).toHaveTextContent('30%');
    const canopy = canopyField();
    await user.clear(canopy);
    await user.type(canopy, '35');
    expect(summary).toHaveTextContent('35%');
  });

  it('shows no error when an invalid field loses focus, only on Continue', async () => {
    const { user } = renderStep();
    const canopy = canopyField();
    await user.clear(canopy);
    await user.type(canopy, '140');
    await user.tab();
    expect(canopy).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('parameters step errors', () => {
  it('moves focus to an error summary that links each field, and marks the title', async () => {
    const { user } = renderStep();
    document.title = 'Rules | CommonGround';
    const canopy = canopyField();
    await user.clear(canopy);
    await user.type(canopy, '140');
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    const summary = screen.getByRole('alert');
    expect(summary.closest('[tabindex="-1"]')).toHaveFocus();
    expect(document.title).toBe('Error: Rules | CommonGround');
    const link = screen.getByRole('link', { name: /Enter a number from 0 to 100/ });
    expect(link).toHaveAttribute('href', '#field-canopyMin');
    await user.click(link);
    expect(canopy).toHaveFocus();
  });

  it('saves valid parameters, keeps the typed text and moves on', async () => {
    const { router, user } = renderStep();
    const canopy = canopyField();
    await user.clear(canopy);
    await user.type(canopy, '35');
    await user.selectOptions(
      screen.getByRole('combobox', { name: strings.severity.keys.budget }),
      'hard',
    );
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    expect(router.state.location.pathname).toBe(stepHref('refine'));
    const saved = loadWizard(window.sessionStorage);
    expect(saved.parameters?.canopy.minPercent).toBe(35);
    expect(saved.parameters?.severity.budget).toBe('hard');
    expect(saved.draft?.numbers.canopyMin).toBe('35');
  });

  it('saves a count limit', async () => {
    const { router, user } = renderStep();
    await user.type(screen.getByRole('textbox', { name: 'Most Play' }), '2');
    await user.click(screen.getByRole('button', { name: messages.planner.wizard.continue }));
    expect(router.state.location.pathname).toBe(stepHref('refine'));
    expect(loadWizard(window.sessionStorage).parameters?.counts).toEqual([
      { category: 'play', max: 2 },
    ]);
  });
});
