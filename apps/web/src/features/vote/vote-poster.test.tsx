import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { readPalette } from '@parkshape/scene/plan';
import { SKELETON_DELAY_MS } from '@parkshape/ui';

import { format, messages } from '../../messages';

import { VotePoster } from './vote-poster';

describe('VotePoster', () => {
  it('shows the design thumbnail at a fixed size, loaded first', () => {
    render(<VotePoster design={{ title: 'Loop park', thumbnailUrl: '/blobs/t/a.png' }} />);
    const image = screen.getByRole('img', {
      name: format(messages.vote.posterAlt, { title: 'Loop park' }),
    });
    expect(image).toHaveAttribute('src', '/blobs/t/a.png');
    expect(image).toHaveAttribute('width', '640');
    expect(image).toHaveAttribute('height', '400');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });

  it('fills the space around the picture with the scene sky, so poster and 3D match', () => {
    render(<VotePoster design={{ title: 'Loop park', thumbnailUrl: '/blobs/t/a.png' }} />);
    expect(screen.getByRole('img')).toHaveStyle({ backgroundColor: readPalette(() => '').sky });
  });

  it('says there is no picture yet when the design has no thumbnail', () => {
    render(<VotePoster design={{ title: 'Loop park', thumbnailUrl: null }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(messages.vote.noPoster)).toBeInTheDocument();
  });

  it('shows a poster-sized grey block after 1 s while the design is on its way', () => {
    vi.useFakeTimers();
    const { container } = render(<VotePoster design={null} />);
    expect(container.querySelector('.ps-skeleton__block--poster')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(container.querySelector('.ps-skeleton__block--poster')).not.toBeNull();
    expect(screen.getByText(messages.vote.loadingDesign)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    vi.useRealTimers();
  });

  it('says the design did not load and offers Try again', async () => {
    const onRetry = vi.fn();
    render(<VotePoster design={null} failure={{ onRetry }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(messages.vote.failed);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
