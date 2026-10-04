import { useEffect, useState } from 'react';

import type { DrawPlan } from './plan-drawing';

/** Loads the plan drawing code once a card needs it, and keeps it for the rest of the visit. */
export function usePlanDrawing(need: 'needed' | 'idle'): DrawPlan | null {
  const [draw, setDraw] = useState<{ readonly plan: DrawPlan } | null>(null);
  useEffect(() => {
    if (need === 'idle' || draw !== null) return;
    let active = true;
    void import('./plan-drawing').then((module) => {
      if (active) setDraw({ plan: module.drawPlan });
    });
    return () => {
      active = false;
    };
  }, [need, draw]);
  return draw?.plan ?? null;
}
