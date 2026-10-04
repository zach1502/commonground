import type { RenderFeatures } from '../perf/render-tier.js';

type ComposerComponent = typeof import('./PostEffects.js').PostEffects;

const loadComposer = async (): Promise<ComposerComponent> =>
  (await import('./PostEffects.js')).PostEffects;

/**
 * The composer's code for tiers that draw it, or null. The composer is about 110 KB compressed,
 * so a phone, which never draws it, never downloads it.
 */
export function composerCode<T = ComposerComponent>(
  features: Pick<RenderFeatures, 'composer'>,
  load: () => Promise<T> = loadComposer as () => Promise<T>,
): Promise<T> | null {
  return features.composer === 'on' ? load() : null;
}
