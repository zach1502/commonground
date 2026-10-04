import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS } from '@parkshape/ui';

import { messages } from '../messages';

import {
  bootKindFor,
  revealFor,
  RouteSkeleton,
  skeletonDelayAt,
  skeletonKindFor,
} from './route-skeleton';

describe('skeletonKindFor', () => {
  it.each([
    ['/projects/jrp/leaderboard', 'board'],
    ['/projects/jrp/designs', 'gallery'],
    ['/projects/jrp/vote', 'vote'],
    ['/staff/projects/jrp/insights', 'board'],
    ['/projects', 'page'],
    ['/projects/jrp/design/d1', 'none'],
  ] as const)('picks the %s layout for %s', (path, kind) => {
    expect(skeletonKindFor(path)).toBe(kind);
  });
});

describe('RouteSkeleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws twelve table rows for the leaderboard after 1 s, and nothing before', () => {
    const { container } = render(<RouteSkeleton kind="board" />);
    expect(container.querySelectorAll('.ps-skeleton__block--row')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(container.querySelectorAll('.ps-skeleton__block--row')).toHaveLength(12);
    expect(screen.getByText(messages.app.loading)).toBeInTheDocument();
  });

  it('draws a poster and three buttons for the vote page', () => {
    const { container } = render(<RouteSkeleton kind="vote" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(container.querySelectorAll('.ps-skeleton__block--poster')).toHaveLength(1);
    expect(container.querySelectorAll('.ps-skeleton__block--button')).toHaveLength(3);
  });

  it('draws thumbnail cards for the gallery', () => {
    const { container } = render(<RouteSkeleton kind="gallery" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(container.querySelectorAll('.ps-skeleton__block--card').length).toBeGreaterThan(0);
  });

  it('draws nothing for the editor, which shows its own loading', () => {
    const { container } = render(<RouteSkeleton kind="none" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(container).toBeEmptyDOMElement();
  });
});

describe('bootKindFor', () => {
  it('gives the editor route its bar and stage while the first load runs', () => {
    expect(bootKindFor('/projects/jrp/design/d1')).toBe('editor');
  });

  it('keeps the other layouts', () => {
    expect(bootKindFor('/projects/jrp/vote')).toBe('vote');
  });
});

describe('skeletonDelayAt', () => {
  it('waits out the rest of the first second after navigation', () => {
    expect(skeletonDelayAt(SKELETON_DELAY_MS - 400)).toBe(400);
  });

  it('shows at once when the wait is already over 1 s', () => {
    expect(skeletonDelayAt(SKELETON_DELAY_MS + 3000)).toBe(0);
  });
});

describe('RouteSkeleton for the editor', () => {
  it('draws the bar and one stage block', () => {
    vi.useFakeTimers();
    const { container } = render(<RouteSkeleton kind="editor" delayMs={0} />);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(container.querySelectorAll('.ps-skeleton__block--poster')).toHaveLength(1);
    expect(container.querySelectorAll('.ps-skeleton__block--button')).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('revealFor (J13)', () => {
  it('fades content in after a wait, except on the vote route, whose picture is the LCP', () => {
    expect(revealFor('vote')).toBe('instant');
    expect(revealFor('gallery')).toBe('fade');
    expect(revealFor('board')).toBe('fade');
    expect(revealFor('page')).toBe('fade');
    expect(revealFor('none')).toBe('instant');
  });
});
