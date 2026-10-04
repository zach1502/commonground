import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { InfoTooltip } from './info-tooltip.js';

describe('InfoTooltip', () => {
  it('shows a focusable trigger and reveals the note on hover', async () => {
    render(
      <InfoTooltip triggerLabel="Why this order">New designs start near the middle.</InfoTooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Why this order' });
    expect(trigger).toBeInTheDocument();
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(screen.getByText('New designs start near the middle.')).toBeInTheDocument();
    });
  });
});
