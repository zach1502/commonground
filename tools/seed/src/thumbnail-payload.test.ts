import { describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import { frameFor, heightmapFromPayload, heightmapPayload } from './thumbnail-page/payload.js';

describe('frameFor', () => {
  it('draws the park today as the large baseline and designs as thumbnails', () => {
    expect(frameFor('baseline')).toBe('baseline');
    expect(frameFor('design')).toBe('thumbnail');
  });
});

describe('heightmapPayload', () => {
  it('survives the trip into the page as the same recorded terrain', () => {
    const terrain = makeRampHeightmap({ width: 3, height: 2, resolutionM: 1, gradeX: 0.1 });
    const payload = JSON.parse(JSON.stringify(heightmapPayload(terrain))) as unknown;
    const back = heightmapFromPayload(payload);
    expect(back.width).toBe(terrain.width);
    expect(back.height).toBe(terrain.height);
    expect(Array.from(back.elevations)).toEqual(Array.from(terrain.elevations));
    expect(back.elevations).toBeInstanceOf(Float32Array);
  });
});
