import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Insights } from '../api/staff-api';
import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import {
  apiServer,
  createTestDeps,
  projectFixture,
  RESIDENT,
  session,
  STAFF,
  TEST_API_URL,
} from '../test/api-server';
import fixture from '../test/insights-fixture.json' with { type: 'json' };
import { renderApp } from '../test/render-app';

// The real viewer needs WebGL; Playwright covers the terrain and overlay.
vi.mock('@parkshape/scene/viewer', () => {
  const ParkViewer = ({ children }: { children?: unknown }) => (
    <div data-testid="park-viewer">{children as never}</div>
  );
  const HeatmapOverlay = ({ opacity, grid }: { opacity: number; grid: { category: string } }) => (
    <div data-testid="heatmap" data-category={grid.category} data-opacity={opacity} />
  );
  const OverlayCheckbox = () => null;
  const viewerScene = () => ({ heightmap: null, document: null, catalog: null });
  return { ParkViewer, HeatmapOverlay, OverlayCheckbox, viewerScene };
});

const text = messages.insights;
const INSIGHTS = fixture as Insights;
const LAZY_TIMEOUT_MS = 15_000;
// Only the polling test polls fast; elsewhere a second response would race the assertions.
const FAST_POLL_MS = 30;
const NO_POLL_MS = 3_600_000;

const SUMMARY = {
  themes: [{ label: 'Keep and add trees', designCount: 4, exampleDesignId: 'd1' }],
  tradeoffs: [{ a: 'More water', b: 'More play', leanA: 12, chose: 21 }],
  source: 'rule-based',
  designsRead: 10,
};

async function openInsights(
  insights: Insights = INSIGHTS,
  pollIntervalMs = NO_POLL_MS,
  summary: object = SUMMARY,
) {
  const project = await projectFixture({ baselineDesignId: null });
  const calls = { insights: 0 };
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp/summary`, () => HttpResponse.json(summary)),
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
    http.get(`${TEST_API_URL}/projects/jrp/insights`, () => {
      calls.insights += 1;
      return HttpResponse.json(
        calls.insights > 1
          ? { ...insights, headline: { ...insights.headline, votesCast: 9 } }
          : insights,
      );
    }),
  );
  session.user = STAFF;
  const deps = { ...createTestDeps(), pollIntervalMs };
  renderApp(PATHS.insights('jrp'), deps);
  await screen.findByRole('heading', { level: 1 }, { timeout: LAZY_TIMEOUT_MS });
  return calls;
}

describe('insights page generated summary', () => {
  it('shows themes and tradeoffs as labelled data under Generated summary', async () => {
    await openInsights();
    const section = await screen.findByRole('region', { name: text.summary.heading });
    expect(section).toHaveTextContent('Generated summary');
    const [themes, tradeoffs] = within(section).getAllByRole('definition');
    expect(within(section).getAllByRole('term')[0]).toHaveTextContent('Keep and add trees');
    expect(themes).toHaveTextContent('4 of the top 10 designs');
    expect(within(section).getAllByRole('term')[1]).toHaveTextContent('More water or more play');
    expect(tradeoffs).toHaveTextContent('12 of 21 designs leaned to more water');
    expect(within(section).getByText(text.summary.ruleBased)).toBeInTheDocument();
  });

  it('says in every top design once for the themes that all the top designs share', async () => {
    await openInsights(INSIGHTS, NO_POLL_MS, {
      ...SUMMARY,
      themes: [
        { label: 'Keep and add trees', designCount: 10, exampleDesignId: 'd1' },
        { label: 'A community garden', designCount: 10, exampleDesignId: 'd2' },
      ],
    });
    const section = await screen.findByRole('region', { name: text.summary.heading });
    expect(within(section).getAllByText(text.summary.themeEvery)).toHaveLength(1);
    expect(within(section).getAllByRole('term')[0]).toHaveTextContent(
      'Keep and add trees and a community garden',
    );
  });

  it('leaves the section out when the summary is off', async () => {
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/summary`, () =>
        HttpResponse.json(
          { error: { kind: 'feature-off', message: 'off', requestId: 'r' } },
          { status: 503 },
        ),
      ),
    );
    const project = await projectFixture({ baselineDesignId: null });
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
      http.get(`${TEST_API_URL}/projects/jrp/insights`, () => HttpResponse.json(INSIGHTS)),
    );
    session.user = STAFF;
    renderApp(PATHS.insights('jrp'), { ...createTestDeps(), pollIntervalMs: NO_POLL_MS });
    await screen.findByRole('heading', { level: 1 }, { timeout: LAZY_TIMEOUT_MS });
    expect(screen.queryByRole('region', { name: text.summary.heading })).toBeNull();
  });
});

describe('insights page', () => {
  it('leads with the headline numbers as a definition list', async () => {
    await openInsights();
    const list = screen.getByLabelText(text.headlineLabel);
    expect(list.tagName).toBe('DL');
    expect(list.previousElementSibling?.querySelector('h1')).not.toBeNull();
    const facts = within(list).getAllByRole('definition');
    expect(facts.map((fact) => fact.textContent)).toEqual(['3', '6', '7']);
    expect(within(list).getAllByRole('term')[0]).toHaveTextContent(text.headline.designsSubmitted);
    await waitFor(() => {
      expect(document.title).toBe(text.meta.title);
    });
  });

  it('gives every chart a caption', async () => {
    await openInsights();
    const { up, down } = text.reasons;
    for (const caption of [text.features.shareCaption, up.caption, down.caption]) {
      expect(screen.getByRole('figure', { name: caption })).toBeInTheDocument();
    }
    expect(screen.getByRole('figure', { name: text.heatmap.caption })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: text.compliance.caption })).toBeInTheDocument();
  });
});

describe('insights page counts and tables', () => {
  it('says when the votes were counted, right under the counts', async () => {
    await openInsights();
    expect(document.querySelector('.ps-counted-at')).toHaveTextContent(
      format(text.countedAt, { time: '26 September 2026, 3:20 pm' }),
    );
  });

  it('keeps zero rows behind Show all and right-aligns table numbers', async () => {
    await openInsights();
    const figure = screen.getByRole('figure', { name: text.features.shareCaption });
    const chart = figure.closest('.web-insights__chart');
    if (chart === null) throw new Error('no feature chart');
    const before = within(figure).getAllByRole('listitem').length;
    await userEvent.click(within(chart as HTMLElement).getByRole('button', { name: /^Show all/ }));
    expect(within(figure).getAllByRole('listitem').length).toBeGreaterThan(before);
    const table = screen.getByRole('table', { name: text.compliance.caption });
    expect(within(table).getAllByRole('cell')[0]).toHaveClass('ps-table__num');
    expect(screen.getByText(text.earthworks.axis)).toHaveTextContent('m³');
  });

  it('switches the heatmap layer and changes its opacity', async () => {
    await openInsights();
    const overlay = await screen.findByTestId('heatmap', {}, { timeout: LAZY_TIMEOUT_MS });
    expect(overlay).toHaveAttribute('data-category', 'path');
    await userEvent.click(screen.getByRole('radio', { name: text.heatmap.layers.tree }));
    expect(screen.getByTestId('heatmap')).toHaveAttribute('data-category', 'tree');
    fireEvent.change(screen.getByRole('slider', { name: text.heatmap.opacityLabel }), {
      target: { value: '40' },
    });
    expect(screen.getByTestId('heatmap')).toHaveAttribute('data-opacity', '0.4');
  });

  it('lists every heatmap layer in four labelled groups', async () => {
    await openInsights();
    const paths = screen.getByRole('radiogroup', { name: text.heatmap.groups.pathsAndGrading });
    const features = screen.getByRole('radiogroup', { name: text.heatmap.groups.places });
    expect(screen.getAllByRole('radiogroup')).toHaveLength(4);
    expect(within(paths).getAllByRole('radio')).toHaveLength(3);
    expect(within(features).getByRole('radio', { name: text.heatmap.layers.water })).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(Object.keys(text.heatmap.layers).length);
    await userEvent.click(within(features).getByRole('radio', { name: text.heatmap.layers.plaza }));
    expect(screen.getByRole('radio', { name: text.heatmap.layers.plaza })).toBeChecked();
    expect(screen.getByRole('radio', { name: text.heatmap.layers.path })).not.toBeChecked();
    // The group without the checked layer still takes Tab, at its first option.
    expect(within(paths).getAllByRole('radio')[0]).toHaveAttribute('tabindex', '0');
  });

  it('makes Export CSV the one primary action and links every export to the API', async () => {
    await openInsights();
    const csv = screen.getByRole('link', { name: text.exports.csv });
    expect(csv).toHaveAttribute('data-variant', 'primary');
    expect(csv).toHaveAttribute('href', `${TEST_API_URL}/projects/jrp/insights/export.csv`);
    expect(csv).toHaveAttribute('download', 'parkshape-jrp-top-10.csv');
    for (const name of [text.exports.geojson, text.exports.dxf]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('data-variant', 'secondary');
    }
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });
});

describe('insights page tables and access', () => {
  it('shows suppressed engagement groups as under 5', async () => {
    await openInsights();
    const fsa = screen.getByRole('table', { name: text.engagement.fsaCaption });
    const rows = within(fsa).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'V5T9',
      `V6A${text.engagement.suppressed}`,
      `${text.engagement.notAnswered}${text.engagement.suppressed}`,
    ]);
    const ages = screen.getByRole('table', { name: text.engagement.ageCaption });
    expect(within(ages).getByRole('row', { name: /30 to 44/ })).toHaveTextContent('8');
  });

  it('refreshes the numbers by polling', async () => {
    const calls = await openInsights(INSIGHTS, FAST_POLL_MS);
    await waitFor(() => {
      expect(calls.insights).toBeGreaterThan(1);
    });
    const list = screen.getByLabelText(text.headlineLabel);
    await waitFor(() => {
      expect(within(list).getAllByRole('definition')[2]).toHaveTextContent('9');
    });
  });

  it('shows empty states when nothing is submitted and there is no baseline', async () => {
    await openInsights({ ...INSIGHTS, earthworks: { binM3: 50, bins: [] }, baselineDiff: [] });
    expect(screen.getByText(text.earthworks.empty)).toBeInTheDocument();
    expect(screen.getByText(text.baseline.empty)).toBeInTheDocument();
  });
});

describe('insights page empty charts', () => {
  it('says so when no vote named a reason, in place of an empty chart', async () => {
    const reasons = { ...INSIGHTS.reasons, up: [], down: [] };
    await openInsights({ ...INSIGHTS, reasons });
    expect(screen.getAllByText(text.reasons.empty)).toHaveLength(2);
    expect(screen.queryByRole('figure', { name: text.reasons.up.caption })).toBeNull();
  });

  it('sends residents away from the page', async () => {
    await projectFixture();
    session.user = RESIDENT;
    const { router } = renderApp(PATHS.insights('jrp'));
    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe(PATHS.insights('jrp'));
    });
  });

  it('links to the insights from staff home', async () => {
    const project = await projectFixture();
    apiServer.use(
      http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    );
    session.user = STAFF;
    renderApp(PATHS.staff);
    const link = await screen.findByRole('link', {
      name: format(messages.planner.home.insights, { name: project.name }),
    });
    expect(link).toHaveAttribute('href', PATHS.insights('jrp'));
  });
});

describe('insights page order and folds', () => {
  function landmarks(): string[] {
    const marks = document.querySelectorAll('.web-insights h2, .web-insights details > summary');
    return [...marks].map((node) => node.textContent);
  }

  it('runs summary, heatmap, features, reasons and rules, then folds and feedback', async () => {
    await openInsights();
    expect(landmarks()).toEqual([
      text.summary.heading,
      text.heatmap.heading,
      format(text.features.title, { value: 'Trees' }),
      text.features.tableFold,
      text.reasons.heading,
      text.reasons.up.tableFold,
      text.reasons.down.tableFold,
      text.compliance.heading,
      'Reasons for each design, 3 rows',
      '2 comments',
      text.feedback.heading,
      'Changes to what is there today, 3 rows',
      'Soil moved by design, 4 bars',
      format(text.exports.heading, { count: 10 }),
      text.engagement.heading,
    ]);
    const counted = document.querySelector('.ps-counted-at') as Node;
    const after = screen.getByLabelText(text.headlineLabel).compareDocumentPosition(counted);
    expect(after).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('keeps each fold closed and never nests one in another', async () => {
    await openInsights();
    const folds = [...document.querySelectorAll('.web-insights details')];
    expect(folds).toHaveLength(7);
    for (const fold of folds) {
      expect((fold as HTMLDetailsElement).open).toBe(false);
      expect(fold.querySelector('details')).toBeNull();
    }
    const table = screen.getByRole('table', { name: text.reasons.byDesignCaption });
    expect(folds).toContain(table.closest('details'));
  });

  it('puts the caption and the ramp legend above the canvas, and opacity under the layers', async () => {
    await openInsights();
    const figure = screen.getByRole('figure', { name: text.heatmap.caption });
    const stage = figure.querySelector('.web-insights__stage');
    const caption = figure.querySelector('figcaption');
    expect(caption?.compareDocumentPosition(stage as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(figure).getByText('0 to 3 designs')).toBeInTheDocument();
    const steps = [...figure.querySelectorAll<HTMLElement>('.web-insights__legend-step')];
    expect(steps.at(-1)?.style.backgroundColor).toBe('rgb(63, 127, 166)');
    const layers = screen.getByRole('group', { name: text.heatmap.layerLabel });
    const slider = screen.getByRole('slider', { name: text.heatmap.opacityLabel });
    expect(layers.compareDocumentPosition(slider)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
