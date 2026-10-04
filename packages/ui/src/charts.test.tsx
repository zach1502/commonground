import { readFileSync } from 'node:fs';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BarChart } from './bar-chart.js';
import { Histogram } from './histogram.js';

const CHART_CSS = readFileSync(`${import.meta.dirname}/insights.css`, 'utf8');

/** The declarations of the rule whose selector is exactly the one given. */
function ruleBody(selector: string): string {
  const start = CHART_CSS.indexOf(`\n${selector} {`);
  return start < 0 ? '' : CHART_CSS.slice(start, CHART_CSS.indexOf('}', start));
}

describe('chart colours', () => {
  it('fills bars in the dark grey border token, so blue stays for actions', () => {
    const bar = ruleBody('.ps-chart__bar');
    expect(bar).toContain('fill: var(--surface-color-border-dark);');
    expect(bar).not.toContain('--surface-color-primary-default');
  });

  it('edges the track with a 1 px default border, so a short bar still shows the full length', () => {
    const track = ruleBody('.ps-chart__track');
    expect(track).toContain('stroke: var(--surface-color-border-default);');
    expect(track).toContain('stroke-width: var(--layout-border-width-small);');
    expect(track).toContain('vector-effect: non-scaling-stroke;');
  });
});

const percent = (value: number) => `${String(Math.round(value))}%`;

describe('BarChart', () => {
  const bars = [
    { id: 'tree', label: 'Trees', value: 80 },
    { id: 'play', label: 'Play', value: 20 },
    { id: 'dog', label: 'Dog areas', value: 0 },
  ];

  it('shows a caption and names every value for screen readers', () => {
    render(
      <BarChart
        caption="Share of designs with each feature."
        bars={bars}
        max={100}
        format={percent}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Share of designs with each feature.' });
    const items = within(figure).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Trees: 80%',
      'Play: 20%',
      'Dog areas: 0%',
    ]);
  });

  it('draws bar lengths in proportion to the maximum', () => {
    const { container } = render(
      <BarChart caption="Caption." bars={bars} max={100} format={percent} />,
    );
    const widths = [...container.querySelectorAll('rect.ps-chart__bar')].map((bar) =>
      Number(bar.getAttribute('width')),
    );
    expect(widths[0]).toBeCloseTo((widths[1] ?? 0) * 4);
    expect(widths[2]).toBe(0);
  });

  it('uses the largest value as the maximum when none is given', () => {
    const { container } = render(<BarChart caption="Caption." bars={bars} format={percent} />);
    const first = container.querySelector('rect.ps-chart__bar');
    const track = container.querySelector('rect.ps-chart__track');
    expect(first?.getAttribute('width')).toBe(track?.getAttribute('width'));
  });

  it('draws empty bars when every value is zero', () => {
    const zeros = bars.map((bar) => ({ ...bar, value: 0 }));
    const { container } = render(<BarChart caption="Caption." bars={zeros} format={percent} />);
    const widths = [...container.querySelectorAll('rect.ps-chart__bar')].map((bar) =>
      bar.getAttribute('width'),
    );
    expect(widths).toEqual(['0', '0', '0']);
  });
});

describe('Histogram', () => {
  const bins = [
    { id: '-50', label: '-50 to 0', count: 1 },
    { id: '0', label: '0 to 50', count: 3 },
    { id: '50', label: '50 to 100', count: 0 },
  ];

  it('shows a caption, the axis label and each bin count', () => {
    render(
      <Histogram
        caption="Designs by net soil moved."
        axisLabel="Net fill, m3"
        bins={bins}
        format={(count) => `${String(count)} designs`}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Designs by net soil moved.' });
    expect(within(figure).getByText('Net fill, m3')).toBeInTheDocument();
    expect(
      within(figure)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['-50 to 0: 1 designs', '0 to 50: 3 designs', '50 to 100: 0 designs']);
  });

  it('draws column heights in proportion to the tallest bin', () => {
    const { container } = render(
      <Histogram caption="C." axisLabel="A" bins={bins} format={String} />,
    );
    const heights = [...container.querySelectorAll('rect.ps-chart__bar')].map((bar) =>
      Number(bar.getAttribute('height')),
    );
    expect(heights[1]).toBeCloseTo((heights[0] ?? 0) * 3);
    expect(heights[2]).toBe(0);
  });

  it('draws nothing but the caption when there are no bins', () => {
    const { container } = render(
      <Histogram caption="C." axisLabel="A" bins={[]} format={String} />,
    );
    expect(container.querySelectorAll('rect.ps-chart__bar')).toHaveLength(0);
  });
});

describe('chart data markers', () => {
  it('marks BarChart values as data so word counts can skip them', () => {
    const bars = [
      { id: 'tree', label: 'Trees', value: 80 },
      { id: 'play', label: 'Play', value: 20 },
    ];
    const { container } = render(
      <BarChart caption="Caption." bars={bars} max={100} format={(value) => String(value)} />,
    );
    const values = [...container.querySelectorAll('text.ps-chart__value')];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((node) => node.getAttribute('data-kind') === 'data')).toBe(true);
  });

  it('marks Histogram counts as data so word counts can skip them', () => {
    const bins = [
      { id: '0', label: '0 to 50', count: 3 },
      { id: '50', label: '50 to 100', count: 1 },
    ];
    const { container } = render(
      <Histogram caption="C." axisLabel="A" bins={bins} format={String} />,
    );
    const values = [...container.querySelectorAll('text.ps-chart__value')];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((node) => node.getAttribute('data-kind') === 'data')).toBe(true);
  });
});
