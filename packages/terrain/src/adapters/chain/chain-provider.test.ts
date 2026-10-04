import { describe, expect, it } from 'vitest';

import { err, makeFlatHeightmap, ok } from '@parkshape/core';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import type { TerrainError, TerrainProvider } from '../../ports/terrain-provider.js';

import { ChainProvider } from './chain-provider.js';

const request = { polygonWgs84: JONATHAN_ROGERS_POLYGON, resolutionM: 1 };
const SOURCE = { name: 'Test DEM', licence: 'CC0', url: 'https://example.test' };

function failing(name: string, error: TerrainError): TerrainProvider & { calls: number } {
  const provider = {
    name,
    calls: 0,
    getHeightmap() {
      provider.calls += 1;
      return Promise.resolve(err(error));
    },
  };
  return provider;
}

function working(name: string): TerrainProvider & { calls: number } {
  const provider = {
    name,
    calls: 0,
    getHeightmap() {
      provider.calls += 1;
      const heightmap = makeFlatHeightmap({ width: 2, height: 2, elevationM: 12 });
      return Promise.resolve(ok({ heightmap, source: SOURCE, crs: 'EPSG:3979' }));
    },
  };
  return provider;
}

describe('ChainProvider', () => {
  it('falls through failing providers and records which one succeeded', async () => {
    const first = failing('hrdem', { kind: 'noCoverage', collection: 'hrdem-mosaic-1m' });
    const second = working('mrdem');
    const third = working('static');
    const result = await new ChainProvider([first, second, third]).getHeightmap(request);
    expect(result.ok && result.value.source).toEqual(SOURCE);
    expect(result.ok && result.value.attempts).toEqual([
      { provider: 'hrdem', outcome: 'failed', errorKind: 'noCoverage' },
      { provider: 'mrdem', outcome: 'succeeded' },
    ]);
    expect(third.calls).toBe(0);
  });

  it('returns every attempt when all providers fail', async () => {
    const result = await new ChainProvider([
      failing('hrdem', { kind: 'network', url: 'u', message: 'offline' }),
      failing('mrdem', { kind: 'noData', cells: 4 }),
    ]).getHeightmap(request);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'allProvidersFailed',
        attempts: [
          { provider: 'hrdem', outcome: 'failed', errorKind: 'network' },
          { provider: 'mrdem', outcome: 'failed', errorKind: 'noData' },
        ],
      },
    });
  });

  it('names itself after the providers it chains', () => {
    expect(new ChainProvider([working('a'), working('b')]).name).toBe('chain(a,b)');
  });
});
