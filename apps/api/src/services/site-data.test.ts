import { describe, expect, it } from 'vitest';

import { makeFlatHeightmap } from '@parkshape/core';
import type { TerrainResult } from '@parkshape/terrain';

import { siteDataError } from '../errors.js';

import { resolvedProvider } from './site-data.js';

const GRID = { width: 2, height: 2, resolutionM: 1, originLocal: { x: 0, y: 0 } };

function result(attempts?: TerrainResult['attempts']): TerrainResult {
  return {
    heightmap: makeFlatHeightmap(GRID),
    source: { name: 'NRCan MRDEM', licence: 'OGL-C', url: 'https://example.org' },
    crs: 'EPSG:3979',
    ...(attempts === undefined ? {} : { attempts }),
  };
}

describe('resolvedProvider', () => {
  it('names the chain attempt that succeeded', () => {
    const attempts = [
      { provider: 'hrdem', outcome: 'failed', errorKind: 'noCoverage' },
      { provider: 'mrdem', outcome: 'succeeded' },
    ] as const;
    expect(resolvedProvider(result(attempts), 'chain(hrdem,mrdem,static)')).toBe('mrdem');
  });

  it('uses the provider name when there was no chain', () => {
    expect(resolvedProvider(result(), 'hrdem')).toBe('hrdem');
  });
});

describe('siteDataError', () => {
  it('maps each provider error to one API kind', () => {
    expect(siteDataError({ kind: 'parkNotFound', parkName: 'X' }).kind).toBe('not-found');
    expect(siteDataError({ kind: 'invalidRequest', reason: 'bad' }).kind).toBe('validation');
    expect(siteDataError({ kind: 'httpStatus', url: 'u', status: 500 }).kind).toBe(
      'upstream-failed',
    );
    expect(siteDataError({ kind: 'noCoverage', collection: 'hrdem' }).kind).toBe(
      'site-data-unavailable',
    );
  });
});
