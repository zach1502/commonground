import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BlockingList, type BlockingItem } from './blocking-list.js';
import { MeterGroup } from './meter-group.js';

describe('MeterGroup', () => {
  it('labels the section with its heading', () => {
    render(
      <MeterGroup heading="Budget and land">
        <p>a meter</p>
      </MeterGroup>,
    );
    expect(screen.getByRole('region', { name: 'Budget and land' })).toBeInTheDocument();
    expect(screen.getByText('a meter')).toBeInTheDocument();
  });
});

const items: readonly BlockingItem[] = [
  {
    id: 'requiredFeatures',
    message: 'Garden areas fit 18 plots. Make them larger to fit 20.',
    severityText: 'Blocks submission',
    canShow: true,
  },
  {
    id: 'budget',
    message: 'Design costs $520,000, over the $500,000 budget.',
    severityText: 'Blocks submission',
    canShow: false,
  },
];

describe('BlockingList', () => {
  it('renders nothing when there are no blocking problems', () => {
    const { container } = render(
      <BlockingList
        heading="Fix before submit"
        items={[]}
        showMeLabel="Show me"
        onShowMe={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each problem with its severity note', () => {
    render(
      <BlockingList
        heading="Fix before submit"
        items={items}
        showMeLabel="Show me"
        onShowMe={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('Garden areas fit 18 plots. Make them larger to fit 20.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Blocks submission')).toHaveLength(2);
  });

  it('shows a Show me button only when the problem has a place to frame', () => {
    const onShowMe = vi.fn();
    render(
      <BlockingList
        heading="Fix before submit"
        items={items}
        showMeLabel="Show me"
        onShowMe={onShowMe}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: 'Show me' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith('requiredFeatures');
  });
});

describe('BlockingList focus', () => {
  it('draws Show me as a secondary button and can take focus from Submit', () => {
    render(
      <BlockingList
        id="problems"
        heading="Fix before submit"
        items={items}
        showMeLabel="Show me"
        onShowMe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Show me' })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    const list = screen.getByRole('alert');
    expect(list).toHaveAttribute('id', 'problems');
    list.focus();
    expect(list).toHaveFocus();
  });
});
