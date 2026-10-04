import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { siteContextSchema } from '@parkshape/core';

import type { Project } from '../api/web-api';

import { useEditorSiteContext } from './use-editor-site-context';

const CONTEXT = siteContextSchema.parse({
  bufferM: 300,
  recordedAt: '2026-10-03T16:26:45.290Z',
  features: [],
});
const POLYGON = [
  { x: 0, y: 0 },
  { x: 176, y: 0 },
  { x: 176, y: 86 },
];
const PROJECT = {
  id: 'jrp',
  parcel: {
    id: 'jrp',
    name: 'Jonathan Rogers Park',
    polygon: POLYGON,
    origin: { lat: 49.26, lon: -123.1 },
  },
} as unknown as Project;

describe('useEditorSiteContext', () => {
  it('hands the editor the context, the parcel boundary and this device for the layer toggles', async () => {
    const api = { getContext: vi.fn().mockResolvedValue(CONTEXT) };
    const storage = window.localStorage;
    const { result } = renderHook(() => useEditorSiteContext(api, PROJECT, storage));
    expect(result.current.load).toEqual({ kind: 'loading' });
    await waitFor(() => {
      expect(result.current.load).toEqual({ kind: 'ready', context: CONTEXT });
    });
    expect(result.current.parcel).toEqual(POLYGON);
    expect(result.current.storage).toBe(storage);
  });
});
