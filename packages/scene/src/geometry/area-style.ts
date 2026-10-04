import type { ScenePalette } from '../palette/colours.js';
import type { AreaKind, GroundPoint } from '../types.js';

import type { ModuleGrid, PanelTransform } from './area-fill.js';

export interface AreaTreatment {
  readonly surface: keyof ScenePalette;
  readonly fence: 'fenced' | 'open';
  readonly modules?: ModuleGrid;
}

// Raised beds of 1.2 m by 2.4 m with wheelchair-width aisles.
const RAISED_BEDS: ModuleGrid = { widthM: 1.2, depthM: 2.4, aisleM: 1.2, jitterM: 0.1 };

const TREATMENTS: Readonly<Record<AreaKind, AreaTreatment>> = {
  garden: { surface: 'soil', fence: 'fenced', modules: RAISED_BEDS },
  playground: { surface: 'soilDark', fence: 'fenced' },
  'dog-park': { surface: 'terrainMeadow', fence: 'fenced' },
  lawn: { surface: 'terrainMeadow', fence: 'open' },
};

/** How each kind of area is drawn: its ground colour, whether it is fenced, and what fills it. */
export function areaTreatment(kind: AreaKind): AreaTreatment {
  return TREATMENTS[kind];
}

/** Panel to leave open as a gate: the one nearest to any path point, or -1 with no paths. */
export function gateIndex(
  panels: readonly PanelTransform[],
  paths: readonly (readonly GroundPoint[])[],
): number {
  let best = -1;
  let bestDistance = Infinity;
  panels.forEach((panel, index) => {
    paths.flat().forEach((point) => {
      const distance = Math.hypot(panel.position.x - point.x, panel.position.z - point.z);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
  });
  return best;
}
