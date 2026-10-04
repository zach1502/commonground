import { describe, expect, it, vi } from 'vitest';

import { renderFeatures } from '../perf/render-tier.js';

import { composerCode } from './post-effects-chunk.js';

describe('composerCode', () => {
  it('loads the composer code for the desktop tier', async () => {
    const load = vi.fn().mockResolvedValue('code');
    const code = composerCode(renderFeatures({ tier: 'desktop', caveat: 'none' }), load);
    expect(load).toHaveBeenCalledOnce();
    expect(await code).toBe('code');
  });

  it('loads nothing for the phone tier, which draws no composer', () => {
    const load = vi.fn();
    expect(composerCode(renderFeatures({ tier: 'phone', caveat: 'none' }), load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
