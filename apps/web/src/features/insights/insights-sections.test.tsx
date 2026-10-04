import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Insights } from '../../api/staff-api';
import { format, messages } from '../../messages';
import fixture from '../../test/insights-fixture.json' with { type: 'json' };

import { FeatureCharts, ReasonsSection } from './insights-sections';

const INSIGHTS = fixture as Insights;
const text = messages.insights;

describe('ReasonsSection', () => {
  it('draws the up vote reasons most named first', () => {
    render(<ReasonsSection reasons={INSIGHTS.reasons} votes={7} />);
    const figure = screen.getByRole('figure', { name: text.reasons.up.caption });
    const labels = within(figure)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(labels[0]).toContain(messages.vote.reasons.paths);
    expect(labels[1]).toContain(messages.vote.reasons.trees);
  });

  it('titles the up and down charts with the reason each side named most', () => {
    render(<ReasonsSection reasons={INSIGHTS.reasons} votes={7} />);
    const titles = screen.getAllByRole('heading', { level: 3 }).map((title) => title.textContent);
    expect(titles).toEqual([
      format(text.reasons.up.title, { value: messages.vote.reasons.paths }),
      format(text.reasons.down.title, { value: messages.vote.reasons['too-expensive'] }),
    ]);
    const down = screen.getByRole('figure', { name: text.reasons.down.caption });
    expect(within(down).getAllByRole('listitem')[0]).toHaveTextContent(
      messages.vote.reasons['too-expensive'],
    );
  });

  it('offers a table for each side with its own vote column', async () => {
    render(<ReasonsSection reasons={INSIGHTS.reasons} votes={7} />);
    for (const side of [text.reasons.up, text.reasons.down]) {
      await userEvent.click(screen.getByText(side.tableFold));
      const table = screen.getByRole('table', { name: format(side.tableCaption, { votes: 7 }) });
      expect(within(table).getByRole('columnheader', { name: side.voteCountColumn })).toBeVisible();
    }
  });

  it('shows at most seven bars, folding the rest behind Show all', async () => {
    const up = [
      { reason: 'trees', count: 90 },
      { reason: 'paths', count: 80 },
      { reason: 'play', count: 70 },
      { reason: 'garden', count: 60 },
      { reason: 'water', count: 50 },
      { reason: 'dog-area', count: 40 },
      { reason: 'too-paved', count: 30 },
      { reason: 'accessibility', count: 20 },
      { reason: 'too-expensive', count: 10 },
    ];
    const reasons = { overall: up, up, down: [], byDesign: [] } as unknown as Insights['reasons'];
    render(<ReasonsSection reasons={reasons} votes={100} />);
    const figure = screen.getByRole('figure', { name: text.reasons.up.caption });
    expect(within(figure).getAllByRole('listitem')).toHaveLength(7);
    await userEvent.click(screen.getByRole('button', { name: /^Show all/ }));
    expect(within(figure).getAllByRole('listitem')).toHaveLength(9);
  });
});

describe('ReasonsSection Show all', () => {
  it('counts Show all from each side, with no button when a side shows every named reason', () => {
    const names = [
      'trees',
      'paths',
      'play',
      'garden',
      'water',
      'dog-area',
      'too-paved',
      'accessibility',
      'too-expensive',
      'other',
    ];
    const up = names.map((reason, index) => ({ reason, count: 100 - index }));
    const down = names.map((reason, index) => ({ reason, count: index < 3 ? 5 - index : 0 }));
    const reasons = { overall: up, up, down, byDesign: [] } as unknown as Insights['reasons'];
    render(<ReasonsSection reasons={reasons} votes={100} />);
    const buttons = screen.getAllByRole('button', { name: /^Show all/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(format(text.showAll, { count: 10 }));
    const downFigure = screen.getByRole('figure', { name: text.reasons.down.caption });
    expect(within(downFigure).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('figure', { name: text.reasons.up.caption })).toBeVisible();
  });
});

describe('FeatureCharts', () => {
  it('states the finding in an active heading, with the leading feature as data', () => {
    render(<FeatureCharts features={INSIGHTS.features} designs={3} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(
      format(text.features.title, { value: messages.planner.parameters.counts.categories.tree }),
    );
    expect(heading.querySelector('[data-kind="data"]')).toHaveTextContent(
      messages.planner.parameters.counts.categories.tree,
    );
  });

  it('offers a table alternative with headers, a caption and the n on each row', async () => {
    render(<FeatureCharts features={INSIGHTS.features} designs={3} />);
    const fold = screen.getByText(text.features.tableFold);
    await userEvent.click(fold);
    const table = screen.getByRole('table', { name: text.features.tableCaption });
    expect(
      within(table).getByRole('columnheader', { name: text.features.featureColumn }),
    ).toBeVisible();
    expect(
      within(table).getByRole('columnheader', { name: text.features.designsColumn }),
    ).toBeVisible();
    // Each row carries its n, such as "2 of 3 designs".
    expect(within(table).getAllByText(/of 3 designs/).length).toBeGreaterThan(0);
  });

  it('falls back to the topic heading and no table when nothing is added', () => {
    const features = INSIGHTS.features.map((row) => ({ ...row, designsWithPercent: 0 }));
    render(<FeatureCharts features={features} designs={3} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(text.features.heading);
    expect(screen.queryByText(text.features.tableFold)).toBeNull();
  });
});
