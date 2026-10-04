import { describe, expect, it } from 'vitest';

import {
  defaultParameters,
  designDocumentSchema,
  makeFlatHeightmap,
  parcelSchema,
  type DesignDocumentInput,
} from '@parkshape/core';
import type { Project } from '@parkshape/db';
import { InMemoryBlobStore } from '@parkshape/storage';

import { InlineMetricsRunner } from '../adapters/inline-metrics-runner.js';
import { ApiError } from '../errors.js';
import type { MetricsRunner } from '../ports/metrics-runner.js';

import {
  hardFailuresOf,
  heightmapBaseKey,
  loadProjectTerrain,
  measureSubmission,
} from './index.js';

interface Point {
  x: number;
  y: number;
}

const rectangle = (width: number, depth: number): [Point, Point, Point, Point] => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: depth },
  { x: 0, y: depth },
];

const parcel = parcelSchema.parse({
  id: 'p',
  name: 'Test parcel',
  polygon: rectangle(40, 30),
  origin: { lat: 49.26, lon: -123.1 },
});

const base: DesignDocumentInput = {
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
};

const flat = { heightmap: makeFlatHeightmap({ width: 40, height: 30 }), source: 'flat' as const };

function measure(input: DesignDocumentInput) {
  return measureSubmission(new InlineMetricsRunner(), {
    document: designDocumentSchema.parse(input),
    parameters: defaultParameters(),
    parcel,
    terrain: flat,
  });
}

describe('measureSubmission', () => {
  it('lists the failed hard garden rule with its message', async () => {
    const garden = { id: 'g1', catalogId: 'community-garden', polygon: rectangle(12, 12) };
    const metrics = await measure({ ...base, areas: [{ ...garden, locked: false }] });
    expect(metrics.heightmapSource).toBe('flat');
    expect(metrics.totals.gardenPlots).toBe(18);
    expect(hardFailuresOf(metrics)).toEqual([
      { key: 'requiredFeatures', detail: metrics.constraints.requiredFeatures.message },
    ]);
  });

  it('passes a garden that fits the required plots', async () => {
    const garden = { id: 'g1', catalogId: 'community-garden', polygon: rectangle(12, 16) };
    const metrics = await measure({ ...base, areas: [{ ...garden, locked: false }] });
    expect(metrics.totals.gardenPlots).toBe(24);
    expect(hardFailuresOf(metrics)).toEqual([]);
  });

  it('turns a document core cannot measure into a validation error', async () => {
    const item = { id: 'x', catalogId: 'hot-tub', position: { x: 1, y: 1 }, rotationDeg: 0 };
    await expect(measure({ ...base, items: [{ ...item, locked: false }] })).rejects.toThrow(
      ApiError,
    );
  });

  it('turns a runner timeout into an error that names the wait', async () => {
    const runner: MetricsRunner = {
      measure: () => Promise.resolve({ kind: 'timed-out', afterMs: 10 }),
      close: () => Promise.resolve(),
    };
    await expect(
      measureSubmission(runner, {
        document: designDocumentSchema.parse(base),
        parameters: defaultParameters(),
        parcel,
        terrain: flat,
      }),
    ).rejects.toThrow('took over 10 ms');
  });
});

describe('measureSubmission when the runner fails', () => {
  it.each([
    { kind: 'timed-out', afterMs: 10 },
    { kind: 'failed', message: 'The metrics worker stopped with code 1.' },
  ] as const)('turns a $kind outcome into a 503 the client can retry', async (outcome) => {
    const runner: MetricsRunner = {
      measure: () => Promise.resolve(outcome),
      close: () => Promise.resolve(),
    };
    const error: unknown = await measureSubmission(runner, {
      document: designDocumentSchema.parse(base),
      parameters: defaultParameters(),
      parcel,
      terrain: flat,
    }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'metricsUnavailable', status: 503 });
    expect((error as ApiError).details.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('loadProjectTerrain', () => {
  const project = { id: 'p1', heightmapRef: 'terrain/p1.bin' } as Project;

  it('keys the stored pair by the ref without its .bin extension', () => {
    expect(heightmapBaseKey('terrain/p1.bin')).toBe('terrain/p1');
    expect(heightmapBaseKey('terrain/p1')).toBe('terrain/p1');
  });

  it('uses a flat grid over the parcel when nothing is stored', async () => {
    const store = new InMemoryBlobStore({ baseUrl: 'http://blobs.test' });
    const terrain = await loadProjectTerrain(store, project, parcel);
    expect(terrain.source).toBe('flat');
    expect(terrain.heightmap).toMatchObject({ width: 40, height: 30, originLocal: { x: 0, y: 0 } });
  });
});
