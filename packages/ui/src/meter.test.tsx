import { readFileSync } from 'node:fs';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Meter, meterPercent, type MeterStatus } from './meter.js';
import { MOTION_CLASS, MOTION_MS } from './motion/index.js';

const STATUSES: readonly MeterStatus[] = ['ok', 'warn', 'fail'];

describe('Meter', () => {
  it.each(STATUSES)('uses the %s status class', (status) => {
    render(
      <Meter
        label="Budget"
        value={40}
        limit={100}
        status={status}
        valueText="$40 of $100"
        statusText="Status"
      />,
    );
    const meter = screen.getByRole('meter', { name: 'Budget' });
    expect(meter).toHaveClass(`ps-meter--${status}`);
    expect(meter).toHaveAttribute('aria-valuenow', '40');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '$40 of $100');
  });

  it('shows the value text and keeps the status word for screen readers only', () => {
    render(
      <Meter
        label="Tree canopy"
        value={12}
        limit={30}
        status="warn"
        valueText="12%"
        statusText="Below target"
      />,
    );
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('12%')).toHaveAttribute('data-kind', 'data');
    const status = screen.getByText('Below target');
    expect(status).toHaveClass('ps-visually-hidden');
    expect(status).not.toHaveClass('ps-meter__value');
  });

  it('animates the fill through the motion class', () => {
    const { container } = render(
      <Meter
        label="Grade"
        value={5}
        limit={10}
        status="ok"
        valueText="5%"
        statusText="Within limit"
      />,
    );
    const fill = container.querySelector('.ps-meter__fill');
    expect(fill).toHaveClass(MOTION_CLASS.status);
    expect(fill).toHaveStyle({ width: '50%' });
  });
});

describe('meterPercent', () => {
  it('clamps to 0 and 100', () => {
    expect(meterPercent(-5, 10)).toBe(0);
    expect(meterPercent(20, 10)).toBe(100);
    expect(meterPercent(3, 12)).toBe(25);
  });

  it('returns 0 when the limit is not positive', () => {
    expect(meterPercent(3, 0)).toBe(0);
  });
});

describe('Meter motion (J10)', () => {
  const motionCss = readFileSync(`${import.meta.dirname}/motion/motion.css`, 'utf8');
  const props = { label: 'Budget', limit: 100, statusText: 'Status' } as const;

  it('tweens the fill width over 250 ms and its status colour over 150 ms', () => {
    const { container } = render(<Meter {...props} value={40} status="ok" valueText="$40" />);
    const fill = container.querySelector('.ps-meter__fill');
    expect(fill).toHaveClass(MOTION_CLASS.status);
    const rule = /\.ps-motion-status \{([^}]*)\}/.exec(motionCss)?.[1] ?? '';
    expect(rule).toContain('width var(--motion-duration-medium)');
    expect(rule).toContain('background-color var(--motion-duration-small)');
    expect(motionCss).toContain(`--motion-duration-medium: ${String(MOTION_MS.medium)}ms`);
  });

  it('shows the final number in the first frame, with no count-up', () => {
    const { container, rerender } = render(
      <Meter {...props} value={40} status="ok" valueText="$40" />,
    );
    rerender(<Meter {...props} value={95} status="fail" valueText="$95" />);
    expect(screen.getByText('$95')).toBeInTheDocument();
    expect(container.querySelector('.ps-meter')).toHaveClass('ps-meter--fail');
  });
});
