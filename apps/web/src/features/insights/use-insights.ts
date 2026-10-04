import { useEffect, useState } from 'react';

import type { Insights, StaffApi } from '../../api/staff-api';

/**
 * Holds the insights and refreshes them, skipping polls while the tab is hidden. The next poll
 * waits `intervalMs` after the last one finished, so a slow link never stacks requests.
 */
export function useInsights(
  api: Pick<StaffApi, 'getInsights'>,
  projectId: string,
  initial: Insights,
  intervalMs: number,
): Insights {
  const [insights, setInsights] = useState(initial);
  useEffect(() => {
    let active = true;
    let handle: number | undefined;
    const refresh = async () => {
      if (!document.hidden) {
        const fresh = await api.getInsights(projectId).catch(() => null);
        if (active && fresh !== null) setInsights(fresh);
      }
      if (active) handle = window.setTimeout(() => void refresh(), intervalMs);
    };
    handle = window.setTimeout(() => void refresh(), intervalMs);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [api, projectId, intervalMs]);
  return insights;
}
