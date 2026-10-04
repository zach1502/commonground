import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS } from '@parkshape/ui';

import { messages } from '../messages';

import { LoadingPage } from './error-page';

const SLOW_START_MS = 4000;

describe('LoadingPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('draws the shape at once when the script arrived more than 1 s after navigation', () => {
    vi.spyOn(performance, 'now').mockReturnValue(SLOW_START_MS);
    const { container } = render(<LoadingPage />);
    expect(screen.getByText(messages.app.loading)).toBeInTheDocument();
    expect(container.querySelectorAll('.ps-skeleton__block').length).toBeGreaterThan(0);
  });

  it('shows nothing new inside the first second', () => {
    vi.spyOn(performance, 'now').mockReturnValue(SKELETON_DELAY_MS / 2);
    const { container } = render(<LoadingPage />);
    expect(container.querySelectorAll('.ps-skeleton__block')).toHaveLength(0);
  });

  it('draws the editor bar and stage on a first visit to the editor', () => {
    vi.spyOn(performance, 'now').mockReturnValue(SLOW_START_MS);
    window.history.replaceState(null, '', '/projects/p1/design/d1');
    const { container } = render(<LoadingPage />);
    expect(container.querySelectorAll('.ps-skeleton__block--poster')).toHaveLength(1);
  });
});
