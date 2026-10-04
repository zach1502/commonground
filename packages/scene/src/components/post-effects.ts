import type { RenderFeatures } from '../perf/render-tier.js';

export type ComposerPass = 'N8AO' | 'SMAA' | 'ToneMapping';

/** DESIGN.md "Post-processing": half resolution, performance quality, 2 m radius, dark green. */
export const N8AO_SETTINGS = {
  halfRes: true,
  quality: 'performance',
  aoRadius: 2,
  distanceFalloff: 1,
  intensity: 2,
  color: '#1f2a1c',
} as const;

/**
 * The composer renders to a target, where three.js skips its own tone mapping, so ACES moves
 * into the composer. No vignette: it would shade the sky corners away from the fog colour,
 * which DESIGN.md's corner pixel check rules out.
 */
const DESKTOP_PASSES: readonly ComposerPass[] = ['N8AO', 'SMAA', 'ToneMapping'];

/** The effects the composer holds for a tier; the phone tier has no composer at all. */
export function composerPasses(features: RenderFeatures): readonly ComposerPass[] {
  return features.composer === 'on' ? DESKTOP_PASSES : [];
}
