// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompareToggle } from './CompareToggle.js';
import { LoadingOverlay } from './LoadingOverlay.js';
import { OverlayCheckbox } from './OverlayCheckbox.js';
import { ViewPresets } from './ViewPresets.js';

const labels = {
  viewControls: 'View',
  resetView: 'Reset view',
  topDown: 'Top-down',
  birdsEye: "Bird's eye",
};

afterEach(cleanup);

describe('ViewPresets', () => {
  it('offers the three views in a labelled group', () => {
    render(<ViewPresets labels={labels} onSelect={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'View' })).toBeDefined();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Reset view',
      'Top-down',
      "Bird's eye",
    ]);
  });

  it('reports the chosen view', () => {
    const onSelect = vi.fn();
    render(<ViewPresets labels={labels} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Top-down' }));
    expect(onSelect).toHaveBeenCalledWith('top-down');
  });
});

describe('CompareToggle', () => {
  it('shows whether today is on and flips it', () => {
    const onChange = vi.fn();
    render(<CompareToggle label="Compare with today" showing="design" onChange={onChange} />);
    const toggle = screen.getByRole('button', { name: 'Compare with today' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('flips back to the design', () => {
    const onChange = vi.fn();
    render(<CompareToggle label="Compare with today" showing="today" onChange={onChange} />);
    const toggle = screen.getByRole('button', { name: 'Compare with today' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('design');
  });
});

describe('OverlayCheckbox', () => {
  it('shows its state and reports the next one', () => {
    const onChange = vi.fn();
    render(<OverlayCheckbox label="Hide items" checked="off" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Hide items' });
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith('on');
  });
});

describe('LoadingOverlay', () => {
  it('shows real progress and names the source', () => {
    render(<LoadingOverlay progress={42.4} message="Loading terrain from NRCan HRDEM" />);
    const bar = screen.getByRole('progressbar', { name: 'Loading terrain from NRCan HRDEM' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText('Loading terrain from NRCan HRDEM')).toBeDefined();
  });
});
