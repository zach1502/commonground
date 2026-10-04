import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { Design, Project } from '../../api/web-api';
import { apiServer } from '../../test/api-server';

import { VoteViewer } from './vote-viewer';

// The real viewer pulls in three.js; the test reads the props it is given.
vi.mock('@parkshape/scene/viewer', () => {
  interface StubProps {
    readonly manifest?: Record<string, { url: string }>;
    readonly heightmap?: { readonly width: number } | null;
    readonly context?: { readonly streetNames: string; readonly visible: object } | undefined;
    readonly walk?: {
      readonly start?: string;
      readonly onModeChange?: (mode: 'walk' | 'overview') => void;
    };
  }
  function ParkViewer({ manifest, heightmap, context, walk }: StubProps) {
    return (
      <div
        data-testid="park-viewer"
        data-terrain-width={heightmap?.width ?? 'flat'}
        data-street-names={context?.streetNames ?? 'none'}
        data-walk={walk?.start ?? 'none'}
      >
        {JSON.stringify(manifest ?? null)}
        {walk === undefined ? null : (
          <button type="button" onClick={() => walk.onModeChange?.('overview')}>
            Back to overview
          </button>
        )}
      </div>
    );
  }
  const viewerScene = (_document: unknown, _parcel: unknown, terrain?: unknown) => ({
    heightmap: terrain ?? null,
    document: null,
    catalog: null,
  });
  return { ParkViewer, viewerScene };
});
vi.mock('@parkshape/core', async (original) => {
  const core = await original<typeof import('@parkshape/core')>();
  const pass = { parse: (value: unknown) => value };
  return { ...core, designDocumentSchema: pass, parcelSchema: pass };
});

const MODELS = { models: [{ modelKey: 'tree-oak', file: 'models/tree-oak.glb' }] };
const DESIGN = { id: 'a', title: 'Loop park', document: {} } as unknown as Design;
const PROJECT = { id: 'jrp', parcel: {} } as unknown as Project;
const TERRAIN = { width: 176, height: 86, resolutionM: 1, originLocal: { x: 0, y: 0 } };
const CONTEXT = { bufferM: 300, recordedAt: '2026-10-03T16:26:45.290Z', features: [] };
const api = {
  getTerrain: vi.fn().mockResolvedValue(TERRAIN),
  getContext: vi.fn().mockResolvedValue(CONTEXT),
};

describe('VoteViewer', () => {
  it('draws the real GLB models from the manifest, as the design page does', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    render(<VoteViewer design={DESIGN} project={PROJECT} api={api} />);
    const viewer = await screen.findByTestId('park-viewer');
    expect(JSON.parse(viewer.textContent)).toEqual({
      'tree-oak': { url: '/models/tree-oak.glb' },
    });
  });

  it('draws the design on the project terrain, as the still pictures do', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    render(<VoteViewer design={DESIGN} project={PROJECT} api={api} />);
    const viewer = await screen.findByTestId('park-viewer');
    expect(api.getTerrain).toHaveBeenCalledWith('jrp');
    expect(viewer).toHaveAttribute('data-terrain-width', '176');
  });

  it('draws the default context layers read-only, with no street names on the card', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    render(<VoteViewer design={DESIGN} project={PROJECT} api={api} />);
    const viewer = await screen.findByTestId('park-viewer');
    expect(api.getContext).toHaveBeenCalledWith('jrp');
    await waitFor(() => {
      expect(viewer).toHaveAttribute('data-street-names', 'hidden');
    });
  });

  it('starts the walk once the scene is drawn and tells the card when it ends', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    const onLeave = vi.fn();
    const walking = {
      ...DESIGN,
      document: { items: [], paths: [], areas: [], water: [] },
    } as unknown as Design;
    const parcel = { polygon: [{ x: 0, y: 0 }] };
    render(
      <VoteViewer
        design={walking}
        project={{ ...PROJECT, parcel } as unknown as Project}
        api={api}
        walk={{ onLeave }}
      />,
    );
    expect(await screen.findByTestId('park-viewer')).toHaveAttribute('data-walk', 'on-ready');
    await userEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('has no walk until the card asks for one', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    render(<VoteViewer design={DESIGN} project={PROJECT} api={api} />);
    expect(await screen.findByTestId('park-viewer')).toHaveAttribute('data-walk', 'none');
  });
});
