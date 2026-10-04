import { describe, expect, it } from 'vitest';

import { probeRenderTier } from './probe-render-tier.js';
import type { ProbeEnvironment } from './probe-render-tier.js';

type Contexts = 'both' | 'plain-only' | 'none';

function environment(
  contexts: Contexts,
  coarse: 'coarse' | 'fine' = 'fine',
  renderer = 'ANGLE (Apple M1 Pro)',
): ProbeEnvironment {
  const getContext = (_kind: string, options?: { failIfMajorPerformanceCaveat?: boolean }) => {
    if (contexts === 'none') return null;
    if (contexts === 'plain-only' && options?.failIfMajorPerformanceCaveat === true) return null;
    return {
      getExtension: () => ({ loseContext: () => undefined, UNMASKED_RENDERER_WEBGL: 1 }),
      getParameter: () => renderer,
    };
  };
  return {
    createCanvas: () => ({ getContext }) as unknown as HTMLCanvasElement,
    hardwareConcurrency: 6,
    matchMedia: () => ({ matches: coarse === 'coarse' }),
  };
}

describe('probeRenderTier', () => {
  it('reports no caveat when the strict context works', () => {
    expect(probeRenderTier(environment('both'))).toEqual({
      majorPerformanceCaveat: 'none',
      hardwareConcurrency: 6,
      pointer: 'fine',
    });
  });

  it('reports a major caveat when only the plain context works', () => {
    expect(probeRenderTier(environment('plain-only')).majorPerformanceCaveat).toBe('major');
  });

  it('reports the missing caveat when WebGL2 is missing altogether', () => {
    expect(probeRenderTier(environment('none')).majorPerformanceCaveat).toBe('missing');
  });

  it('reports a major caveat for a software rasteriser the browser did not flag', () => {
    const swiftShader = environment('both', 'fine', 'ANGLE (Google, Vulkan (SwiftShader Device))');
    expect(probeRenderTier(swiftShader).majorPerformanceCaveat).toBe('major');
  });

  it('reads a coarse pointer from the media query', () => {
    expect(probeRenderTier(environment('both', 'coarse')).pointer).toBe('coarse');
  });
});
