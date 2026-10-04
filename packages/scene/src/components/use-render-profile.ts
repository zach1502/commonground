import { useCallback, useEffect, useState } from 'react';

import { probeRenderTier } from '../perf/probe-render-tier.js';
import { declineProfile, pickRenderTier } from '../perf/render-tier.js';
import type { ForcedTier, RenderProfile, RenderTier } from '../perf/render-tier.js';

export interface RenderProfileState {
  readonly profile: RenderProfile;
  /** PerformanceMonitor's onDecline: moves the session to the phone tier. */
  readonly decline: () => void;
}

/** Probes the device once per mount; a forced tier, as from the dev page, wins over the probe. */
export function useRenderProfile(
  forced: ForcedTier | undefined,
  onTier: ((tier: RenderTier) => void) | undefined,
): RenderProfileState {
  const [profile, setProfile] = useState(() => pickRenderTier(probeRenderTier(), forced));
  const decline = useCallback(() => {
    if (forced !== 'desktop-pinned') setProfile(declineProfile);
  }, [forced]);
  useEffect(() => {
    onTier?.(profile.tier);
  }, [onTier, profile.tier]);
  return { profile, decline };
}
