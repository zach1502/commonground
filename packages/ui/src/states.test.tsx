import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keysSharedByAll } from './badge.js';
import { CountedAt, formatCountedAt } from './counted-at.js';
import { EmptyState } from './empty-state.js';
import { InlineAlert } from './inline-alert.js';
import { NavigationProvider } from './navigation.js';
import { PageTitle } from './page-title.js';
import { SKELETON_DELAY_MS, Skeleton, SkeletonBlock } from './skeleton.js';

describe('Skeleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing before 1 s, so a fast load never flashes a skeleton', () => {
    const { container } = render(
      <Skeleton label="Loading the leaderboard">
        <SkeletonBlock shape="row" />
      </Skeleton>,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(container.querySelector('.ps-skeleton__block')).toBeNull();
    expect(screen.queryByText('Loading the leaderboard')).not.toBeInTheDocument();
  });

  it('shows the blocks on the first render when no wait is left', () => {
    const { container } = render(
      <Skeleton label="Loading the page" delayMs={0}>
        <SkeletonBlock shape="line" />
      </Skeleton>,
    );
    expect(container.querySelectorAll('.ps-skeleton__block')).toHaveLength(1);
    expect(screen.getByText('Loading the page')).toBeInTheDocument();
  });

  it('shows static blocks and a spoken label after 1 s', () => {
    const { container } = render(
      <Skeleton label="Loading the leaderboard">
        <SkeletonBlock shape="heading" />
        <SkeletonBlock shape="row" />
      </Skeleton>,
    );
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading the leaderboard')).toBeInTheDocument();
    const blocks = container.querySelectorAll('.ps-skeleton__block');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveClass('ps-skeleton__block--heading');
    expect(blocks[0]).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('EmptyState', () => {
  it('says what is missing and links to the task that fills it', async () => {
    const navigate = vi.fn();
    render(
      <NavigationProvider navigate={navigate}>
        <EmptyState text="No designs yet." action={{ href: '/new', label: 'Design the park' }} />
      </NavigationProvider>,
    );
    expect(screen.getByText('No designs yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Design the park' }));
    expect(navigate).toHaveBeenCalledWith('/new');
  });

  it('renders the text alone when there is no task', () => {
    render(<EmptyState text="No open projects." />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('InlineAlert', () => {
  it('announces a danger alert with its title and description', () => {
    render(
      <InlineAlert tone="danger" title="Vote not saved." description="Check your connection." />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Vote not saved.');
    expect(alert).toHaveTextContent('Check your connection.');
  });

  it('uses a status role and the tone class for other tones', () => {
    render(<InlineAlert tone="success" title="Vote saved." />);
    expect(screen.getByRole('status')).toHaveTextContent('Vote saved.');
    expect(document.querySelector('.bcds-Inline-Alert.success svg')).not.toBeNull();
  });
});

describe('InlineAlert with an action', () => {
  it('offers a retry button inside the alert', async () => {
    const onPress = vi.fn();
    render(
      <InlineAlert
        tone="danger"
        title="The leaderboard did not load."
        action={{ label: 'Try again', onPress }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe('PageTitle context line', () => {
  it('puts the park name as a plain line above the heading', () => {
    render(<PageTitle context="Jonathan Rogers Park">Designs</PageTitle>);
    const heading = screen.getByRole('heading', { level: 1, name: 'Designs' });
    const context = screen.getByText('Jonathan Rogers Park');
    expect(context).toHaveClass('ps-page-title__context');
    expect(
      context.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('formatCountedAt', () => {
  it('writes the day, month, year and a 12 hour time in the given zone', () => {
    const at = new Date('2026-09-26T22:20:00Z');
    expect(formatCountedAt(at, 'America/Vancouver')).toBe('26 September 2026, 3:20 pm');
  });

  it('renders the time in a time element with the machine value', () => {
    const at = new Date('2026-09-26T22:20:00Z');
    render(<CountedAt template="Votes counted to {time}" at={at} timeZone="America/Vancouver" />);
    expect(document.querySelector('.ps-counted-at')).toHaveTextContent(
      'Votes counted to 26 September 2026, 3:20 pm',
    );
    expect(document.querySelector('time')).toHaveAttribute('dateTime', at.toISOString());
  });
});

describe('keysSharedByAll', () => {
  it('finds the badges that every row carries', () => {
    const rows = [[{ key: 'canopy' }, { key: 'budget' }], [{ key: 'canopy' }]];
    expect([...keysSharedByAll(rows)]).toEqual(['canopy']);
  });

  it('hides nothing when there is one row, since one row cannot share', () => {
    expect(keysSharedByAll([[{ key: 'canopy' }]]).size).toBe(0);
  });
});
