import { describe, expect, it } from 'vitest';

import { declineProfile, pickRenderTier, renderFeatures } from './render-tier.js';
import type { RenderProbe } from './render-tier.js';

const laptop: RenderProbe = {
  majorPerformanceCaveat: 'none',
  hardwareConcurrency: 8,
  pointer: 'fine',
};

describe('pickRenderTier', () => {
  it('gives a capable laptop the desktop tier', () => {
    expect(pickRenderTier(laptop)).toEqual({ tier: 'desktop', caveat: 'none' });
  });

  it('drops to the phone tier on a major performance caveat and records it', () => {
    expect(pickRenderTier({ ...laptop, majorPerformanceCaveat: 'major' })).toEqual({
      tier: 'phone',
      caveat: 'major',
    });
  });

  it('drops to the phone tier at 4 cores or fewer', () => {
    expect(pickRenderTier({ ...laptop, hardwareConcurrency: 4 }).tier).toBe('phone');
    expect(pickRenderTier({ ...laptop, hardwareConcurrency: 5 }).tier).toBe('desktop');
  });

  it('drops to the phone tier with a coarse pointer', () => {
    expect(pickRenderTier({ ...laptop, pointer: 'coarse' }).tier).toBe('phone');
  });

  it('pins the full desktop look for test builds, even on a software rasteriser', () => {
    const software = { ...laptop, majorPerformanceCaveat: 'major' as const };
    expect(pickRenderTier(software, 'desktop-pinned')).toEqual({ tier: 'desktop', caveat: 'none' });
    expect(renderFeatures(pickRenderTier(software, 'desktop-pinned')).composer).toBe('on');
  });

  it('records a missing WebGL2 as the missing caveat on the phone tier', () => {
    expect(pickRenderTier({ ...laptop, majorPerformanceCaveat: 'missing' })).toEqual({
      tier: 'phone',
      caveat: 'missing',
    });
  });

  it('keeps the missing caveat under every forced tier, so the viewer shows the message', () => {
    const missing: RenderProbe = { ...laptop, majorPerformanceCaveat: 'missing' };
    expect(pickRenderTier(missing, 'desktop-pinned').caveat).toBe('missing');
    expect(pickRenderTier(missing, 'desktop').caveat).toBe('missing');
    expect(pickRenderTier(missing, 'phone').caveat).toBe('missing');
  });

  it('lets a forced tier win but keeps the caveat', () => {
    const probe: RenderProbe = { ...laptop, majorPerformanceCaveat: 'major' };
    expect(pickRenderTier(probe, 'desktop')).toEqual({ tier: 'desktop', caveat: 'major' });
    expect(pickRenderTier(laptop, 'phone')).toEqual({ tier: 'phone', caveat: 'none' });
  });
});

describe('declineProfile', () => {
  it('moves a desktop session to the phone tier and keeps it there', () => {
    const declined = declineProfile({ tier: 'desktop', caveat: 'none' });
    expect(declined).toEqual({ tier: 'phone', caveat: 'none' });
    expect(declineProfile(declined)).toEqual(declined);
  });
});

describe('renderFeatures', () => {
  it('gives the desktop tier the shadow map, maps, moving water, dressing and the composer', () => {
    expect(renderFeatures({ tier: 'desktop', caveat: 'none' })).toEqual({
      shadowMapPx: 2048,
      shadows: 'map',
      composer: 'on',
      detailMaps: 'on',
      water: 'animated',
      dressing: 'full',
      antialias: 'off',
      maxDpr: 2,
      frameloop: 'as-asked',
    });
  });

  it('gives the phone tier blob shadows, no composer, no maps, still water and DPR 1', () => {
    const phone = renderFeatures({ tier: 'phone', caveat: 'none' });
    expect(phone).toMatchObject({
      shadows: 'blob',
      composer: 'off',
      detailMaps: 'off',
      water: 'still',
      dressing: 'figures',
      maxDpr: 1,
      antialias: 'on',
    });
  });

  it('also turns off antialias and draws on demand under a major caveat', () => {
    expect(renderFeatures({ tier: 'phone', caveat: 'major' })).toMatchObject({
      shadows: 'blob',
      composer: 'off',
      antialias: 'off',
      frameloop: 'demand',
      maxDpr: 1,
    });
  });

  it('keeps the caveat limits on a forced desktop tier', () => {
    expect(renderFeatures({ tier: 'desktop', caveat: 'major' })).toMatchObject({
      shadows: 'blob',
      composer: 'off',
      detailMaps: 'off',
      antialias: 'off',
    });
  });
});
