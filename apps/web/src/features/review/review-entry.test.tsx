import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

import { ReviewEntry } from './review-entry';

describe('ReviewEntry', () => {
  it('is the primary action on a submitted design while the project is open', () => {
    render(<ReviewEntry design={REVIEW_DESIGN} project={REVIEW_PROJECT} />);
    const link = screen.getByRole('link', { name: 'Review this design' });
    expect(link).toHaveAttribute('href', '/designs/d1/review');
    expect(link).toHaveAttribute('data-variant', 'primary');
  });

  it('becomes a secondary See comments link once the project is closed', () => {
    render(<ReviewEntry design={REVIEW_DESIGN} project={{ ...REVIEW_PROJECT, phase: 'closed' }} />);
    const link = screen.getByRole('link', { name: 'See comments' });
    expect(link).toHaveAttribute('href', '/designs/d1/review');
    expect(link).toHaveAttribute('data-variant', 'secondary');
  });

  it('is not offered on a draft', () => {
    render(<ReviewEntry design={{ ...REVIEW_DESIGN, status: 'draft' }} project={REVIEW_PROJECT} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
