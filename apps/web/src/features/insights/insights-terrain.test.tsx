import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Insights } from '../../api/staff-api';
import { messages } from '../../messages';
import { PATHS } from '../../routing/paths';
import { projectFixture } from '../../test/api-server';
import fixture from '../../test/insights-fixture.json' with { type: 'json' };

import { InsightsTerrain } from './insights-terrain';

// R3F does not load in jsdom. The stub stands in for ParkViewer's SceneGate with the render-tier
// probe fixed at 'missing'; the real gate is tested in packages/scene.
const probe = vi.hoisted(() => ({ caveat: 'missing' }));

vi.mock('@parkshape/scene/viewer', () => {
  interface StubViewerProps {
    readonly webGlMissing?: ReactNode;
    readonly children?: ReactNode;
  }
  const ParkViewer = ({ webGlMissing, children }: StubViewerProps) =>
    probe.caveat === 'missing' ? (
      <div data-webgl="missing">{webGlMissing}</div>
    ) : (
      <canvas>{children}</canvas>
    );
  const HeatmapOverlay = () => null;
  const OverlayCheckbox = () => null;
  const viewerScene = () => ({ heightmap: null, document: null, catalog: null });
  return { ParkViewer, HeatmapOverlay, OverlayCheckbox, viewerScene };
});

const text = messages.editor.viewer;
const [HEATMAP] = (fixture as Insights).heatmaps;

async function renderTerrain() {
  const project = await projectFixture();
  if (HEATMAP === undefined) throw new Error('The insights fixture has no heatmap');
  render(
    <MemoryRouter>
      <InsightsTerrain
        project={project}
        baseline={null}
        heatmap={HEATMAP}
        opacity={1}
        items="shown"
        onItems={vi.fn()}
      />
    </MemoryRouter>,
  );
  return project;
}

describe('InsightsTerrain without WebGL2', () => {
  it('shows the WebGL2 message in place of the 3D terrain', async () => {
    await renderTerrain();
    expect(screen.getByText(text.webGlMissing)).toBeVisible();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('links to the pictures of the designs in this project', async () => {
    const project = await renderTerrain();
    const link = screen.getByRole('link', { name: text.webGlGalleryLink });
    expect(link).toHaveAttribute('href', PATHS.gallery(project.id));
  });
});
