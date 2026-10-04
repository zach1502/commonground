import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { apiServer } from '../test/api-server';

import { useModelManifest } from './use-model-manifest';

const MODELS = { models: [{ modelKey: 'tree-oak', file: 'models/tree-oak.glb' }] };

describe('useModelManifest', () => {
  it('waits, then hands over the models the asset pipeline wrote', async () => {
    apiServer.use(http.get('*/models/index.json', () => HttpResponse.json(MODELS)));
    const { result } = renderHook(() => useModelManifest());
    expect(result.current.state).toBe('loading');
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
    expect(result.current).toEqual({
      state: 'ready',
      manifest: { 'tree-oak': { url: '/models/tree-oak.glb' } },
    });
  });

  it('is ready with no models when the index is missing, so placeholders draw', async () => {
    apiServer.use(http.get('*/models/index.json', () => new HttpResponse(null, { status: 404 })));
    const { result } = renderHook(() => useModelManifest());
    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });
    expect(result.current).toEqual({ state: 'ready', manifest: {} });
  });
});
