import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CONTEXT_FEATURE_KINDS,
  compareContextFeatures,
  siteContextSchema,
  type ContextFeature,
  type PlanePoint,
  type SiteContext,
} from '@parkshape/core';

import { siteFrameFor } from '../../adapters/projection/site-frame.js';
import type { SiteContextProvider, SiteContextRequest } from '../site-context-provider.js';

// Projection and float noise allowed past the buffered box, in metres.
const BOX_TOLERANCE_M = 1;

const sourcesFile = new URL('../../adapters/sources.json', import.meta.url);
const sourceNames = (JSON.parse(readFileSync(sourcesFile, 'utf8')) as { source: string }[]).map(
  (entry) => entry.source,
);

function pointsOf(feature: ContextFeature): readonly PlanePoint[] {
  const { geometry } = feature;
  if (geometry.type === 'line') return geometry.points;
  if (geometry.type === 'polygon') return geometry.ring;
  return [geometry.position];
}

async function contextFor(
  provider: SiteContextProvider,
  request: SiteContextRequest,
): Promise<SiteContext> {
  const result = await provider.getContext(request);
  if (!result.ok) throw new Error(`provider failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

function bufferedBox(request: SiteContextRequest) {
  const ring = siteFrameFor(request.polygonWgs84).parcel.polygonLocal;
  const reach = request.bufferM + BOX_TOLERANCE_M;
  return {
    minX: Math.min(...ring.map((point) => point.x)) - reach,
    minY: Math.min(...ring.map((point) => point.y)) - reach,
    maxX: Math.max(...ring.map((point) => point.x)) + reach,
    maxY: Math.max(...ring.map((point) => point.y)) + reach,
  };
}

type ProviderFactory = () => SiteContextProvider | Promise<SiteContextProvider>;

function shapeContract(name: string, makeProvider: ProviderFactory, request: SiteContextRequest) {
  describe(`${name} meets the SiteContextProvider contract: shape`, () => {
    it('returns a context that parses with the core schema', async () => {
      const context = await contextFor(await makeProvider(), request);
      expect(siteContextSchema.safeParse(context).success).toBe(true);
      expect(context.bufferM).toBe(request.bufferM);
    });

    it('uses only the five layer kinds and finite coordinates', async () => {
      const { features } = await contextFor(await makeProvider(), request);
      features.forEach((feature) => {
        expect(CONTEXT_FEATURE_KINDS).toContain(feature.kind);
        pointsOf(feature).forEach((point) => {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        });
      });
    });

    it('keeps every point within the buffer of the parcel box', async () => {
      const { features } = await contextFor(await makeProvider(), request);
      const box = bufferedBox(request);
      features.flatMap(pointsOf).forEach((point) => {
        expect(point.x).toBeGreaterThanOrEqual(box.minX);
        expect(point.x).toBeLessThanOrEqual(box.maxX);
        expect(point.y).toBeGreaterThanOrEqual(box.minY);
        expect(point.y).toBeLessThanOrEqual(box.maxY);
      });
    });

    it('draws every bus stop as a named point', async () => {
      const { features } = await contextFor(await makeProvider(), request);
      features
        .filter((feature) => feature.kind === 'busStop')
        .forEach((stop) => {
          expect(stop.geometry.type).toBe('point');
          expect(stop.name).toBeDefined();
        });
    });
  });
}

function sourceAndOrderContract(
  name: string,
  makeProvider: ProviderFactory,
  request: SiteContextRequest,
) {
  describe(`${name} meets the SiteContextProvider contract: sources and order`, () => {
    it('names a listed source for every feature', async () => {
      const { features } = await contextFor(await makeProvider(), request);
      features.forEach(({ source }) => {
        expect(sourceNames).toContain(source.name);
      });
    });

    it('sorts by kind, then id, and gives the same answer twice', async () => {
      const provider = await makeProvider();
      const first = await contextFor(provider, request);
      const second = await contextFor(provider, request);
      expect(first.features).toEqual([...first.features].sort(compareContextFeatures));
      expect(second).toEqual(first);
    });

    it('refuses a negative buffer', async () => {
      const result = await (await makeProvider()).getContext({ ...request, bufferM: -1 });
      expect(result.ok || result.error.kind).toBe('invalidRequest');
    });
  });
}

export interface SiteContextContractOptions {
  /** A parcel the adapter's data does not reach, for adapters that read recorded data. */
  readonly uncovered?: SiteContextRequest;
}

function uncoveredContract(
  name: string,
  makeProvider: ProviderFactory,
  uncovered: SiteContextRequest,
) {
  describe(`${name} meets the SiteContextProvider contract: uncovered parcels`, () => {
    it('answers an empty list, not an error, for a parcel its data does not cover', async () => {
      const context = await contextFor(await makeProvider(), uncovered);
      expect(context.features).toEqual([]);
      expect(context.bufferM).toBe(uncovered.bufferM);
    });
  });
}

/**
 * Behaviour every SiteContextProvider adapter must have, whatever its fixtures hold. Each adapter
 * test calls this with a factory and a parcel the adapter can serve.
 */
export function siteContextProviderContract(
  name: string,
  makeProvider: ProviderFactory,
  request: SiteContextRequest,
  options: SiteContextContractOptions = {},
): void {
  shapeContract(name, makeProvider, request);
  sourceAndOrderContract(name, makeProvider, request);
  if (options.uncovered !== undefined) uncoveredContract(name, makeProvider, options.uncovered);
}
