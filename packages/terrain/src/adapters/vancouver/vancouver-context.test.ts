import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { CONTEXT_BUFFER_M, FakeClock, type ContextFeature, type PlanePoint } from '@parkshape/core';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import type { HttpFetch } from '../../ports/http.js';
import { replayFetch } from '../http/recorded-fetch.js';
import { nearestOnPolyline } from '../projection/context-box.js';
import { siteFrameFor } from '../projection/site-frame.js';

import { VancouverContextProvider } from './vancouver-context-provider.js';

const RAW = new URL('../../../fixtures/jonathan-rogers/raw/', import.meta.url);
const recorded = replayFetch(async (name) =>
  readFile(new URL(name, RAW), 'utf8').catch(() => undefined),
);
const clock = new FakeClock(new Date('2026-10-03T16:30:00.000Z'));
const request = { polygonWgs84: JONATHAN_ROGERS_POLYGON, bufferM: CONTEXT_BUFFER_M };
const DEGREES_PER_RADIAN = 180 / Math.PI;
const MAX_ANGLE_DEG = 5;
const NEAREST_M = 6;
const FARTHEST_M = 14;

async function recordedContext() {
  const result = await new VancouverContextProvider({ fetch: recorded, clock }).getContext(request);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('VancouverContextProvider offline', () => {
  it('stops at the first refused request and makes no other call', async () => {
    const urls: string[] = [];
    const refused: HttpFetch = (url) => {
      urls.push(url);
      return Promise.reject(new Error('PARKSHAPE_OFFLINE=1 blocked a request'));
    };
    const result = await new VancouverContextProvider({ fetch: refused, clock }).getContext(
      request,
    );
    expect(result.ok || result.error.kind).toBe('network');
    expect(urls).toHaveLength(1);
  });
});

describe('VancouverContextProvider on the recorded responses', () => {
  it('stamps the time from its clock', async () => {
    expect((await recordedContext()).recordedAt).toBe('2026-10-03T16:30:00.000Z');
  });

  it('keeps street widths to a tenth of a metre', async () => {
    const { features } = await recordedContext();
    features.forEach(({ geometry }) => {
      if (geometry.type === 'line')
        expect(geometry.widthM * 10).toBeCloseTo(Math.round(geometry.widthM * 10), 9);
    });
  });

  it('draws every Broadway stop that TransLink lists within the buffer', async () => {
    const { features } = await recordedContext();
    const stops = features.filter((feature) => feature.kind === 'busStop');
    expect(stops.map((stop) => stop.name)).toContain('Eastbound W Broadway @ Columbia St');
  });
});

/** The parcel side, the street that runs along it, and the street feature nearest its middle. */
const SIDES = [
  { name: 'W 7th Ave', from: 0, to: 1 },
  { name: 'Manitoba St', from: 1, to: 2 },
  { name: 'W 8th Ave', from: 2, to: 3 },
  { name: 'Columbia St', from: 3, to: 0 },
] as const;

function angleBetween(left: PlanePoint, right: PlanePoint): number {
  const cross = left.x * right.y - left.y * right.x;
  const dot = left.x * right.x + left.y * right.y;
  // Parallel either way along the line counts, so fold the angle into 0 to 90 degrees.
  const angle = Math.abs(Math.atan2(cross, dot)) * DEGREES_PER_RADIAN;
  return Math.min(angle, 180 - angle);
}

function nearestStreet(features: readonly ContextFeature[], name: string, middle: PlanePoint) {
  const candidates = features.flatMap((feature) =>
    feature.kind === 'street' && feature.name === name && feature.geometry.type === 'line'
      ? [nearestOnPolyline(middle, feature.geometry.points)]
      : [],
  );
  return candidates
    .filter((foot) => foot !== undefined)
    .sort((left, right) => left.distance - right.distance)[0];
}

describe('the 4 streets around the park', () => {
  const ring = siteFrameFor(JONATHAN_ROGERS_POLYGON).parcel.polygonLocal;

  it.each(SIDES)('$name runs along its side of the parcel, 6 to 14 m out', async (side) => {
    const { features } = await recordedContext();
    const from = ring[side.from];
    const to = ring[side.to];
    if (from === undefined || to === undefined) throw new Error('the parcel has 4 corners');
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const foot = nearestStreet(features, side.name, middle);
    expect(foot).toBeDefined();
    expect(foot?.distance).toBeGreaterThanOrEqual(NEAREST_M);
    expect(foot?.distance).toBeLessThanOrEqual(FARTHEST_M);
    const edge = { x: to.x - from.x, y: to.y - from.y };
    expect(angleBetween(edge, foot?.direction ?? edge)).toBeLessThan(MAX_ANGLE_DEG);
  });
});
