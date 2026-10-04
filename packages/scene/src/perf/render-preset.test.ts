import { describe, expect, it } from 'vitest';

import { offlineRender, OFFLINE_FRAMES, renderPreset } from './render-preset.js';
import { pickRenderTier, renderFeatures } from './render-tier.js';

const softwareProbe = {
  majorPerformanceCaveat: 'major',
  hardwareConcurrency: 2,
  pointer: 'coarse',
} as const;

describe("renderPreset('offline')", () => {
  it('has the features of the interactive desktop viewer, shadow map included', () => {
    const preset = renderPreset('offline');
    expect(preset.features).toEqual(renderFeatures({ tier: 'desktop', caveat: 'none' }));
    expect(preset.features.shadows).toBe('map');
    expect(preset.features.detailMaps).toBe('on');
  });

  it('forces a tier that keeps the desktop look on a software rasteriser', () => {
    const profile = pickRenderTier(softwareProbe, renderPreset('offline').tier);
    expect(renderFeatures(profile)).toEqual(renderPreset('offline').features);
  });

  it('keeps the drawn frame readable for the encoder', () => {
    expect(renderPreset('offline').drawingBuffer).toBe('preserve');
  });
});

describe('offlineRender', () => {
  it('draws the hero, the baseline and the design thumbnails with the one offline preset', () => {
    for (const frame of OFFLINE_FRAMES) {
      expect(offlineRender(frame).preset).toEqual(renderPreset('offline'));
    }
    expect(OFFLINE_FRAMES).toEqual(['thumbnail', 'baseline', 'hero']);
  });

  it('sizes the project page baseline at 1280x800 WebP', () => {
    expect(offlineRender('baseline')).toMatchObject({
      width: 1280,
      height: 800,
      encoding: 'image/webp',
    });
  });

  it('keeps design thumbnails at 640x400 WebP', () => {
    expect(offlineRender('thumbnail')).toMatchObject({
      width: 640,
      height: 400,
      encoding: 'image/webp',
    });
  });

  it('draws the hero at 1920x1080 as a lossless source for the hero encoder', () => {
    expect(offlineRender('hero')).toMatchObject({
      width: 1920,
      height: 1080,
      encoding: 'image/png',
    });
  });
});
