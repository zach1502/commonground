/** How much GPU work the viewer spends; picked once per session and passed down as a prop. */
export type RenderTier = 'desktop' | 'phone';
/**
 * What a caller may force. 'desktop-pinned' is for test builds only: the desktop features even
 * on a software rasteriser, with no decline, so screenshots show the real look. Real users
 * always go through the probe and PerformanceMonitor.
 */
export type ForcedTier = RenderTier | 'desktop-pinned';
/**
 * 'major' when a WebGL2 context with failIfMajorPerformanceCaveat fails but a plain one works.
 * 'missing' when no WebGL2 context works at all: the app shows a message instead of the canvas.
 */
export type PerformanceCaveat = 'none' | 'major' | 'missing';
export type PointerKind = 'fine' | 'coarse';

/** What the browser tells us about the device, gathered by probeRenderTier. */
export interface RenderProbe {
  readonly majorPerformanceCaveat: PerformanceCaveat;
  readonly hardwareConcurrency: number;
  readonly pointer: PointerKind;
}

export interface RenderProfile {
  readonly tier: RenderTier;
  readonly caveat: PerformanceCaveat;
}

export type Toggle = 'on' | 'off';

/** The switches every scene component reads, so each tier rule lives in this one file. */
export interface RenderFeatures {
  /** Shadow map size; 0 when the tier uses blob shadows only. */
  readonly shadowMapPx: number;
  readonly shadows: 'map' | 'blob';
  readonly composer: Toggle;
  /** Terrain detail maps and path textures. */
  readonly detailMaps: Toggle;
  readonly water: 'animated' | 'still';
  /** 'full' is figures, clutter and birds; 'figures' keeps only the people for scale. */
  readonly dressing: 'full' | 'figures';
  readonly antialias: Toggle;
  readonly maxDpr: number;
  /** 'demand' forces draws only after a change; 'as-asked' keeps what the caller chose. */
  readonly frameloop: 'as-asked' | 'demand';
}

// DESIGN.md "Frame budget": 4 cores or fewer is a phone-class device.
const PHONE_CORE_LIMIT = 4;
const DESKTOP_SHADOW_MAP_PX = 2048;
const DESKTOP_MAX_DPR = 2;

/** Picks the tier from a probe; a forced tier (the dev page's ?tier=) wins, the caveat stays. */
export function pickRenderTier(probe: RenderProbe, forced?: ForcedTier): RenderProfile {
  const caveat = probe.majorPerformanceCaveat;
  // No tier can draw without WebGL2, so a forced tier never hides it.
  if (caveat === 'missing') return { tier: 'phone', caveat };
  if (forced === 'desktop-pinned') return { tier: 'desktop', caveat: 'none' };
  if (forced !== undefined) return { tier: forced, caveat };
  const weak =
    caveat === 'major' ||
    probe.hardwareConcurrency <= PHONE_CORE_LIMIT ||
    probe.pointer === 'coarse';
  return { tier: weak ? 'phone' : 'desktop', caveat };
}

/** PerformanceMonitor's onDecline: the session stays on the phone tier from then on. */
export function declineProfile(profile: RenderProfile): RenderProfile {
  return { ...profile, tier: 'phone' };
}

const DESKTOP: RenderFeatures = {
  shadowMapPx: DESKTOP_SHADOW_MAP_PX,
  shadows: 'map',
  composer: 'on',
  detailMaps: 'on',
  water: 'animated',
  dressing: 'full',
  // SMAA in the composer replaces MSAA, which the composer would not use anyway.
  antialias: 'off',
  maxDpr: DESKTOP_MAX_DPR,
  frameloop: 'as-asked',
};

const PHONE: RenderFeatures = {
  shadowMapPx: 0,
  shadows: 'blob',
  composer: 'off',
  detailMaps: 'off',
  water: 'still',
  dressing: 'figures',
  antialias: 'on',
  maxDpr: 1,
  frameloop: 'as-asked',
};

// A software rasteriser: also no MSAA, and draw only after a change.
const CAVEAT: RenderFeatures = { ...PHONE, antialias: 'off', frameloop: 'demand' };

export function renderFeatures(profile: RenderProfile): RenderFeatures {
  if (profile.caveat !== 'none') return CAVEAT;
  return profile.tier === 'desktop' ? DESKTOP : PHONE;
}
