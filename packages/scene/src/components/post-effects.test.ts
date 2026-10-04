import { describe, expect, it } from 'vitest';

import { renderFeatures } from '../perf/render-tier.js';

import { composerPasses, N8AO_SETTINGS } from './post-effects.js';

const BANNED = [
  'Vignette',
  'Bloom',
  'DepthOfField',
  'ChromaticAberration',
  'Noise',
  'GodRays',
  'LensFlare',
];

describe('composerPasses', () => {
  it('holds half-resolution N8AO, SMAA and ACES tone mapping on the desktop tier', () => {
    expect(composerPasses(renderFeatures({ tier: 'desktop', caveat: 'none' }))).toEqual([
      'N8AO',
      'SMAA',
      'ToneMapping',
    ]);
    expect(N8AO_SETTINGS).toMatchObject({
      halfRes: true,
      quality: 'performance',
      aoRadius: 2,
      intensity: 2,
    });
  });

  it('never holds bloom or the other effects DESIGN.md rules out', () => {
    const passes = composerPasses(renderFeatures({ tier: 'desktop', caveat: 'none' }));
    BANNED.forEach((name) => {
      expect(passes).not.toContain(name);
    });
  });

  it('is empty on the phone tier and under a major caveat', () => {
    expect(composerPasses(renderFeatures({ tier: 'phone', caveat: 'none' }))).toEqual([]);
    expect(composerPasses(renderFeatures({ tier: 'desktop', caveat: 'major' }))).toEqual([]);
  });
});
