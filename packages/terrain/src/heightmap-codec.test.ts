import { describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { decodeHeightmap, encodeHeightmap, parseHeightmapHeader } from './heightmap-codec.js';
import { JONATHAN_ROGERS_POLYGON } from './ports/__contracts__/jonathan-rogers.js';

const SOURCE = { name: 'NRCan HRDEM', licence: 'OGL-Canada', url: 'https://example.test' };

function sample() {
  const heightmap = makeRampHeightmap({ width: 3, height: 2, gradeX: 0.5, baseM: 30 });
  return encodeHeightmap({
    result: { heightmap, source: SOURCE, crs: 'EPSG:3979' },
    polygonWgs84: JONATHAN_ROGERS_POLYGON,
    frameOrigin: { lat: 49.26, lon: -123.1 },
  });
}

describe('heightmap codec', () => {
  it('round-trips elevations through little-endian float32 bytes', () => {
    const { header, bytes } = sample();
    expect(bytes.byteLength).toBe(6 * 4);
    const decoded = decodeHeightmap(header, bytes);
    expect(decoded.ok && [...decoded.value.heightmap.elevations]).toEqual([
      30.25, 30.75, 31.25, 30.25, 30.75, 31.25,
    ]);
    expect(decoded.ok && decoded.value.source).toEqual(SOURCE);
  });

  it('reads the header back through its schema', () => {
    const { header } = sample();
    const parsed = parseHeightmapHeader(JSON.parse(JSON.stringify(header)));
    expect(parsed.ok && parsed.value.crs).toBe('EPSG:3979');
  });

  it('rejects a header that is not a heightmap header', () => {
    expect(parseHeightmapHeader({ format: 'other' }).ok).toBe(false);
  });

  it('rejects bytes that do not match the grid size', () => {
    const { header } = sample();
    expect(decodeHeightmap(header, new Uint8Array(8))).toEqual({
      ok: false,
      error: { kind: 'invalidResponse', url: 'heightmap.bin', issues: 'expected 24 bytes, got 8' },
    });
  });
});
