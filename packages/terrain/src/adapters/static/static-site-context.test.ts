import { describe, expect, it } from 'vitest';

import { CONTEXT_BUFFER_M } from '@parkshape/core';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import { parcelPolygonWgs84 } from '../projection/context-box.js';
import { siteFrameFor } from '../projection/site-frame.js';

import { StaticSiteContextProvider } from './static-site-context-provider.js';

async function contextFor(
  polygonWgs84: typeof JONATHAN_ROGERS_POLYGON,
  bufferM = CONTEXT_BUFFER_M,
) {
  const result = await new StaticSiteContextProvider().getContext({ polygonWgs84, bufferM });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

describe('StaticSiteContextProvider', () => {
  it('serves the recorded features with their recorded time', async () => {
    const context = await contextFor(JONATHAN_ROGERS_POLYGON);
    expect(context.features.length).toBeGreaterThan(0);
    expect(context.recordedAt).toMatch(/^2026-10-03T/);
  });

  it('gives the same features for the outline a stored project parcel rebuilds', async () => {
    const site = siteFrameFor(JONATHAN_ROGERS_POLYGON);
    const rebuilt = parcelPolygonWgs84({
      polygon: site.parcel.polygonLocal,
      origin: site.parcel.origin,
    });
    expect(await contextFor(rebuilt)).toEqual(await contextFor(JONATHAN_ROGERS_POLYGON));
  });

  it('cuts the recorded lines to a smaller buffer', async () => {
    const near = await contextFor(JONATHAN_ROGERS_POLYGON, 20);
    const all = await contextFor(JONATHAN_ROGERS_POLYGON);
    expect(near.features.length).toBeGreaterThan(0);
    expect(near.features.length).toBeLessThan(all.features.length);
    expect(near.features.some((feature) => feature.kind === 'busStop')).toBe(false);
  });

  it('reports a missing fixture as a failed read', async () => {
    const provider = new StaticSiteContextProvider({ fixtureDir: '/nowhere/parkshape-context' });
    const result = await provider.getContext({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      bufferM: CONTEXT_BUFFER_M,
    });
    expect(result.ok || result.error.kind).toBe('network');
  });
});
