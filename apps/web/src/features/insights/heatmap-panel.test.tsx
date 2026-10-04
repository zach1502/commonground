import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { designDocumentSchema } from '@parkshape/core';

import type { Insights } from '../../api/staff-api';
import { messages } from '../../messages';
import { projectFixture } from '../../test/api-server';
import fixture from '../../test/insights-fixture.json' with { type: 'json' };

import { HeatmapPanel } from './heatmap-panel';

// R3F does not load in jsdom, so the stub viewer reports what design content it was asked to
// draw, renders its toolbar tools and marks the heatmap overlay.
vi.mock('@parkshape/scene/viewer', () => {
  interface StubCheckboxProps {
    readonly label: string;
    readonly checked: 'on' | 'off';
    readonly onChange: (checked: 'on' | 'off') => void;
  }
  const OverlayCheckbox = ({ label, checked, onChange }: StubCheckboxProps) => (
    <label>
      <input
        type="checkbox"
        checked={checked === 'on'}
        onChange={(event) => {
          onChange(event.target.checked ? 'on' : 'off');
        }}
      />
      {label}
    </label>
  );
  interface StubViewerProps {
    readonly document: {
      readonly items: readonly unknown[];
      readonly paths: readonly unknown[];
      readonly areas: readonly unknown[];
    };
    readonly tools?: ReactNode;
    readonly children?: ReactNode;
  }
  const ParkViewer = ({ document, tools, children }: StubViewerProps) => (
    <div
      data-testid="park-viewer"
      data-items={document.items.length}
      data-paths={document.paths.length}
      data-areas={document.areas.length}
    >
      <div role="toolbar">{tools}</div>
      {children}
    </div>
  );
  const HeatmapOverlay = () => <span data-testid="heatmap-overlay" />;
  const viewerScene = (document: unknown) => ({ heightmap: null, document, catalog: null });
  return { ParkViewer, HeatmapOverlay, OverlayCheckbox, viewerScene };
});

const text = messages.insights.heatmap;
const LAZY_TIMEOUT_MS = 15_000;
const BASELINE = designDocumentSchema.parse({
  version: 1,
  items: [
    { id: 'i1', catalogId: 'bench', position: { x: 5, y: 5 }, rotationDeg: 0, locked: false },
  ],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 9, y: 9 },
      ],
    },
  ],
  areas: [
    {
      id: 'a1',
      catalogId: 'community-garden',
      polygon: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
      locked: true,
      existing: true,
    },
  ],
  gradeDelta: { cells: [] },
  zones: [],
});

async function renderPanel() {
  const project = await projectFixture();
  return render(
    <MemoryRouter>
      <HeatmapPanel
        project={project}
        baseline={BASELINE}
        terrain={Promise.resolve(null)}
        heatmaps={(fixture as Insights).heatmaps}
        designs={3}
        session={window.sessionStorage}
      />
    </MemoryRouter>,
  );
}

const findViewer = () => screen.findByTestId('park-viewer', {}, { timeout: LAZY_TIMEOUT_MS });
const hideBox = async () => {
  await findViewer();
  return screen.getByRole('checkbox', { name: text.hideItems });
};
const drawn = (viewer: HTMLElement) => ({
  items: viewer.dataset.items,
  paths: viewer.dataset.paths,
  areas: viewer.dataset.areas,
});

describe('HeatmapPanel Hide items', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('puts the Hide items box in the 3D view, not in the heatmap controls', async () => {
    await renderPanel();
    const hide = await hideBox();
    expect(within(await findViewer()).getByRole('checkbox', { name: text.hideItems })).toBe(hide);
    expect(hide.closest('.web-insights__controls')).toBeNull();
  });

  it('draws the design content over the heatmap until the box is ticked', async () => {
    await renderPanel();
    const hide = await hideBox();
    expect(hide).not.toBeChecked();
    expect(drawn(await findViewer())).toEqual({ items: '1', paths: '1', areas: '1' });
    await userEvent.click(hide);
    expect(drawn(await findViewer())).toEqual({ items: '0', paths: '0', areas: '0' });
    await userEvent.click(hide);
    expect(drawn(await findViewer())).toEqual({ items: '1', paths: '1', areas: '1' });
  });

  it('keeps the heatmap while items, paths and the garden are hidden', async () => {
    await renderPanel();
    await userEvent.click(await hideBox());
    expect(drawn(await findViewer())).toEqual({ items: '0', paths: '0', areas: '0' });
    expect(screen.getByTestId('heatmap-overlay')).toBeInTheDocument();
  });

  it('remembers the choice for the rest of the session', async () => {
    const first = await renderPanel();
    await userEvent.click(await hideBox());
    first.unmount();
    await renderPanel();
    expect(await hideBox()).toBeChecked();
    expect((await findViewer()).dataset.items).toBe('0');
  });
});

describe('HeatmapPanel desire lines', () => {
  it('says what the desire lines layer shows only while it is picked', async () => {
    await renderPanel();
    expect(screen.queryByText(text.desireLinesNote)).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: text.layers.desireLines }));
    expect(screen.getByText(text.desireLinesNote)).toBeVisible();
  });
});
