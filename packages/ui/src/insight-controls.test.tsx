import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DownloadLink } from './download-link.js';
import { OpacitySlider } from './opacity-slider.js';
import { SegmentedControl } from './segmented-control.js';

const OPTIONS = [
  { value: 'tree', label: 'Trees' },
  { value: 'path', label: 'Paths' },
  { value: 'dog', label: 'Dog areas' },
];

describe('SegmentedControl', () => {
  it('marks the chosen option and reports a click', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Heatmap" options={OPTIONS} value="tree" onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Heatmap' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Trees' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Paths' })).toHaveAttribute('tabindex', '-1');
    await userEvent.click(screen.getByRole('radio', { name: 'Paths' }));
    expect(onChange).toHaveBeenCalledWith('path');
  });

  it('moves with the arrow keys and wraps at the ends', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Heatmap" options={OPTIONS} value="tree" onChange={onChange} />);
    const trees = screen.getByRole('radio', { name: 'Trees' });
    fireEvent.keyDown(trees, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('path');
    fireEvent.keyDown(trees, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('dog');
    fireEvent.keyDown(trees, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('SegmentedControl with the value in another group', () => {
  it('lets Tab reach its first option and arrows move on from there', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl label="Features" options={OPTIONS} value="water" onChange={onChange} />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(radios.every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Trees' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('dog');
  });
});

describe('OpacitySlider', () => {
  it('shows the value as a percent and reports changes from 0 to 1', () => {
    const onChange = vi.fn();
    render(
      <OpacitySlider
        label="Heatmap opacity"
        value={0.6}
        onChange={onChange}
        format={(value) => `${String(Math.round(value * 100))}%`}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Heatmap opacity' });
    expect(slider).toHaveValue('60');
    expect(screen.getByText('60%')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith(0.25);
  });
});

describe('DownloadLink', () => {
  it('links to the file with a download name and a button look', () => {
    render(
      <DownloadLink href="/export.csv" filename="top.csv" variant="secondary">
        Export CSV
      </DownloadLink>,
    );
    const link = screen.getByRole('link', { name: 'Export CSV' });
    expect(link).toHaveAttribute('href', '/export.csv');
    expect(link).toHaveAttribute('download', 'top.csv');
    expect(link).toHaveAttribute('data-variant', 'secondary');
  });

  it('is primary unless told otherwise', () => {
    render(
      <DownloadLink href="/x" filename="x">
        Get
      </DownloadLink>,
    );
    expect(screen.getByRole('link', { name: 'Get' })).toHaveAttribute('data-variant', 'primary');
  });
});
