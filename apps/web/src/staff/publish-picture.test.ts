import { describe, expect, it, vi } from 'vitest';

import { designDocumentSchema, makeRampHeightmap, parcelSchema } from '@parkshape/core';

import type { Project } from '../api/web-api';

import {
  PICTURE_TIMEOUT_MS,
  publishBaselinePicture,
  type PictureRenderer,
} from './publish-picture';

const BASELINE = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});
const PARCEL = parcelSchema.parse({
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  origin: { lat: 49.26, lon: -123.1 },
  polygon: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
  ],
});
const TERRAIN = makeRampHeightmap({ width: 40, height: 30, gradeY: 0.3 });
const PROJECT = { id: 'jrp', baselineDesignId: 'base', parcel: PARCEL } as unknown as Project;

function fakes() {
  const api = {
    getTerrain: vi.fn().mockResolvedValue(TERRAIN),
    saveThumbnail: vi.fn().mockResolvedValue(undefined),
  };
  const render: PictureRenderer = vi.fn().mockResolvedValue('UklGRg==');
  return { api, render };
}

describe('publishBaselinePicture', () => {
  it('draws the park today on its terrain with the seed preset and stores it', async () => {
    const { api, render } = fakes();
    const outcome = await publishBaselinePicture({
      api,
      render,
      project: PROJECT,
      baseline: BASELINE,
    });
    expect(outcome).toBe('stored');
    expect(api.getTerrain).toHaveBeenCalledWith('jrp');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ document: BASELINE, terrain: TERRAIN, frame: 'baseline' }),
    );
    expect(api.saveThumbnail).toHaveBeenCalledWith('base', 'UklGRg==');
  });

  it('skips a project with no baseline design', async () => {
    const { api, render } = fakes();
    const project = { ...PROJECT, baselineDesignId: null };
    expect(await publishBaselinePicture({ api, render, project, baseline: BASELINE })).toBe(
      'skipped',
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('reports a failed render without throwing, so publishing still finishes', async () => {
    const { api } = fakes();
    const render: PictureRenderer = vi.fn().mockRejectedValue(new Error('no WebGL'));
    expect(
      await publishBaselinePicture({ api, render, project: PROJECT, baseline: BASELINE }),
    ).toBe('failed');
    expect(api.saveThumbnail).not.toHaveBeenCalled();
  });
});

describe('publishBaselinePicture with a stuck renderer', () => {
  it('gives up after the bound and stores nothing, so publish never waits forever', async () => {
    vi.useFakeTimers();
    try {
      const { api } = fakes();
      const render: PictureRenderer = () => new Promise<string>(() => undefined);
      const outcome = publishBaselinePicture({ api, render, project: PROJECT, baseline: BASELINE });
      await vi.advanceTimersByTimeAsync(PICTURE_TIMEOUT_MS);
      await expect(outcome).resolves.toBe('failed');
      expect(api.saveThumbnail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
