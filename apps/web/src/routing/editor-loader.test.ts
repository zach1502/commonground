import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { RESIDENT } from '../test/api-server';
import {
  args,
  DESIGN,
  fakeApi,
  loaded,
  loadersWith,
  PROJECT,
  signedIn,
  TERRAIN,
} from '../test/loader-fakes';

describe('editor loader', () => {
  it('load the user, project and design for the editor', async () => {
    const loaders = signedIn({ getDesign: vi.fn().mockResolvedValue(DESIGN) });
    expect(await loaders.editor(args({ id: 'jrp', designId: 'd1' }))).toEqual({
      user: RESIDENT,
      project: PROJECT,
      design: DESIGN,
      baseline: null,
      terrain: TERRAIN,
    });
  });

  it('load the baseline and the terrain for the editor, so its meters match the server', async () => {
    const baseline = { id: 'base', document: { version: 1 } };
    const getDesign = vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve(id === 'base' ? baseline : DESIGN));
    const getProject = vi.fn().mockResolvedValue({ ...PROJECT, baselineDesignId: 'base' });
    const data = loaded(
      await signedIn({ getDesign, getProject }).editor(args({ id: 'jrp', designId: 'd1' })),
    );
    expect(data).toMatchObject({ design: DESIGN, baseline, terrain: TERRAIN });
  });

  it('open the editor on flat ground when the terrain does not load', async () => {
    const loaders = signedIn({
      getDesign: vi.fn().mockResolvedValue(DESIGN),
      getTerrain: vi.fn().mockRejectedValue(new Error('down')),
    });
    const data = loaded(await loaders.editor(args({ id: 'jrp', designId: 'd1' })));
    expect(data.terrain).toBeNull();
  });
});

describe('editor loader with no link to the API', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  const offline = () => new TypeError('Failed to fetch');
  const unreachable = () => loadersWith(fakeApi({ getMe: vi.fn().mockRejectedValue(offline()) }));

  it('opens the copy this device kept from the last visit', async () => {
    const online = signedIn({ getDesign: vi.fn().mockResolvedValue(DESIGN) });
    await online.editor(args({ id: 'jrp', designId: 'd1' }));
    const data = loaded(await unreachable().editor(args({ id: 'jrp', designId: 'd1' })));
    expect(data).toMatchObject({ user: RESIDENT, project: PROJECT, design: DESIGN });
    expect(Array.from(data.terrain?.elevations ?? [])).toEqual(Array.from(TERRAIN.elevations));
  });

  it('keeps the error page for another design, which this device has not opened', async () => {
    await signedIn({ getDesign: vi.fn().mockResolvedValue(DESIGN) }).editor(
      args({ id: 'jrp', designId: 'd1' }),
    );
    await expect(unreachable().editor(args({ id: 'jrp', designId: 'd2' }))).rejects.toThrow();
  });

  it('keeps the error page when the API answered with an error', async () => {
    await signedIn({ getDesign: vi.fn().mockResolvedValue(DESIGN) }).editor(
      args({ id: 'jrp', designId: 'd1' }),
    );
    const failing = loadersWith(
      fakeApi({ getMe: vi.fn().mockRejectedValue(new ApiRequestError(500, 'internal', 'Down')) }),
    );
    await expect(failing.editor(args({ id: 'jrp', designId: 'd1' }))).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });

  it('lets the page frame load with no one signed in', async () => {
    expect(await unreachable().root()).toEqual({ user: null });
  });
});
