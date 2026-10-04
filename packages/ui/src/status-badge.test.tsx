import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './status-badge.js';

describe('StatusBadge', () => {
  it('maps a fail status to the danger badge tone', () => {
    render(<StatusBadge status="fail" statusText="Over budget" />);
    const badge = screen.getByText('Over budget');
    expect(badge).toHaveClass('ps-badge--danger');
    expect(badge.closest('[data-kind="data"]')).not.toBeNull();
  });

  it('maps ok and warn to the success and warning tones', () => {
    const { rerender } = render(<StatusBadge status="ok" statusText="Within budget" />);
    expect(screen.getByText('Within budget')).toHaveClass('ps-badge--success');
    rerender(<StatusBadge status="warn" statusText="Near the limit" />);
    expect(screen.getByText('Near the limit')).toHaveClass('ps-badge--warning');
  });

  it('shows the severity note when the constraint blocks a submit', () => {
    render(
      <StatusBadge status="fail" statusText="Too few plots" severityText="Blocks submission" />,
    );
    expect(screen.getByText('Blocks submission')).toBeInTheDocument();
  });

  it('omits the severity note when none is given', () => {
    render(<StatusBadge status="warn" statusText="Near the limit" />);
    expect(screen.queryByText('Blocks submission')).not.toBeInTheDocument();
  });
});
