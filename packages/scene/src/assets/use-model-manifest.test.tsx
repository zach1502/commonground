// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { modelsIndexLoader, useModelManifest } from './use-model-manifest.js';

afterEach(cleanup);

const index = { models: [{ modelKey: 'washroom-building', file: 'models/washroom.glb' }] };

describe('useModelManifest', () => {
  it('uses the manifest the caller already has, with no fetch', () => {
    const load = vi.fn(() => Promise.resolve({}));
    const given = { bench: { url: '/models/bench.glb' } };
    const { result } = renderHook(() => useModelManifest(given, load));
    expect(result.current).toEqual({ state: 'ready', manifest: given });
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the models index when the caller has none, so the viewer draws the real GLBs', async () => {
    const load = vi.fn(() =>
      Promise.resolve({ 'washroom-building': { url: '/models/washroom.glb' } }),
    );
    const { result } = renderHook(() => useModelManifest(undefined, load));
    expect(result.current).toEqual({ state: 'loading' });
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
    expect(result.current).toEqual({
      state: 'ready',
      manifest: { 'washroom-building': { url: '/models/washroom.glb' } },
    });
  });
});

describe('modelsIndexLoader', () => {
  it('reads the asset pipeline index once and shares it between viewers', async () => {
    const fetchIndex = vi.fn(() => Promise.resolve(new Response(JSON.stringify(index))));
    const load = modelsIndexLoader(fetchIndex);
    const [first, second] = await Promise.all([load(), load()]);
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    expect(fetchIndex).toHaveBeenCalledWith('/models/index.json');
    expect(first).toEqual({ 'washroom-building': { url: '/models/washroom.glb' } });
    expect(second).toBe(first);
  });

  it('settles on an empty manifest when the index is missing, so items draw as placeholders', async () => {
    const missing = modelsIndexLoader(() => Promise.resolve(new Response('', { status: 404 })));
    await expect(missing()).resolves.toEqual({});
    const offline = modelsIndexLoader(() => Promise.reject(new TypeError('offline')));
    await expect(offline()).resolves.toEqual({});
  });
});
