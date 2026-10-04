import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressCount } from './progress-count.js';

describe('ProgressCount', () => {
  it('shows the label and marks the count as data', () => {
    render(<ProgressCount label="3 of 5" current={3} total={5} />);
    const status = screen.getByText('3 of 5');
    expect(status).toHaveAttribute('data-kind', 'data');
    expect(status).toHaveAttribute('data-current', '3');
    expect(status).toHaveAttribute('data-total', '5');
  });
});
