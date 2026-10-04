import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';

import { renderFeatures, type ForcedTier, type RenderFeatures } from './render-tier.js';

/** Named renderer set-ups. 'offline' is every still image: hero, baseline and thumbnails. */
export type RenderPresetName = 'offline';

export interface RenderPreset {
  /** Passed to ParkViewer as its forced tier. */
  readonly tier: ForcedTier;
  /** What that tier draws, for tests and for readers of this file. */
  readonly features: RenderFeatures;
  /** Offline canvases keep the drawn frame, so the encoder can read it after the draw. */
  readonly drawingBuffer: 'preserve';
}

// The pinned desktop tier: the interactive desktop viewer's materials, textures, lights and
// shadow map, even in the seed's SwiftShader Chromium, which would otherwise fall to the phone
// look because of its performance caveat.
const OFFLINE: RenderPreset = {
  tier: 'desktop-pinned',
  features: renderFeatures({ tier: 'desktop', caveat: 'none' }),
  drawingBuffer: 'preserve',
};

const PRESETS: Readonly<Record<RenderPresetName, RenderPreset>> = { offline: OFFLINE };

export function renderPreset(name: RenderPresetName): RenderPreset {
  return PRESETS[name];
}

/** The still images the app stores or ships. */
export const OFFLINE_FRAMES = ['thumbnail', 'baseline', 'hero'] as const;
export type OfflineFrame = (typeof OFFLINE_FRAMES)[number];
export type OfflineEncoding = 'image/webp' | 'image/png';

export interface OfflineRender {
  readonly preset: RenderPreset;
  readonly width: number;
  readonly height: number;
  readonly encoding: OfflineEncoding;
}

// The project page shows the park today at reading width, so it gets twice the thumbnail size
// for sharp pixels on a 2x screen. The hero is lossless here; its script encodes the sizes.
const BASELINE_SCALE = 2;
const HERO_WIDTH = 1920;
const HERO_HEIGHT = 1080;

const FRAMES: Readonly<Record<OfflineFrame, Omit<OfflineRender, 'preset'>>> = {
  thumbnail: { width: THUMBNAIL_WIDTH_PX, height: THUMBNAIL_HEIGHT_PX, encoding: 'image/webp' },
  baseline: {
    width: THUMBNAIL_WIDTH_PX * BASELINE_SCALE,
    height: THUMBNAIL_HEIGHT_PX * BASELINE_SCALE,
    encoding: 'image/webp',
  },
  hero: { width: HERO_WIDTH, height: HERO_HEIGHT, encoding: 'image/png' },
};

/** The preset, pixel size and encoding for one still image. */
export function offlineRender(frame: OfflineFrame): OfflineRender {
  return { preset: renderPreset('offline'), ...FRAMES[frame] };
}
