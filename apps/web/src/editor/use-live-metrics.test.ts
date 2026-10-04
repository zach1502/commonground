import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  catalogIndex,
  createSeededRandom,
  defaultParameters,
  designDocumentSchema,
  parcelSchema,
} from '@parkshape/core';
import type { MetricsClient, MetricsRequest } from '@parkshape/scene/editor';

import { openEditorSession } from './editor-session';
import { useLiveMetrics } from './use-live-metrics';

const document = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

const parcel = parcelSchema.parse({
  id: 'p',
  name: 'Park',
  origin: { lat: 49.26, lon: -123.1 },
  polygon: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
  ],
});

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('useLiveMetrics', () => {
  it('sends the baseline with each request, so a kept garden counts its recorded plots', () => {
    const { ctx } = openEditorSession({
      designId: 'd1',
      userId: 'u1',
      document,
      updatedAt: '2026-09-26T22:20:00.000Z',
      parcel,
      zones: [],
      catalog: catalogIndex,
      random: createSeededRandom(1),
      storage: { session: memory(), local: memory() },
    });
    const sent: MetricsRequest[] = [];
    const client: MetricsClient = {
      compute: (request) => {
        sent.push(request);
      },
      subscribe: vi.fn(() => () => undefined),
      dispose: vi.fn(),
    };
    const baseline = { ...document, zones: [] };
    renderHook(() =>
      useLiveMetrics({ ctx, parcel, parameters: defaultParameters(), client, baseline }),
    );
    expect(sent[0]?.baseline).toBe(baseline);
  });
});
