import type { LayoutNote } from './explain.js';
import { compassZoneAt } from './hints.js';
import type { Layout } from './layout.js';
import type { Site } from './site.js';

/** Canopy this close to the target counts as reaching it. */
const CANOPY_TOLERANCE_PERCENT = 0.05;

function placementNotes(site: Site, layout: Layout): LayoutNote[] {
  return layout.placement.placed.flatMap(
    ({ feature, centre, unmetHint, missingPlaces }): LayoutNote[] => {
      const name = feature.entry.name;
      const missing = missingPlaces.map((place): LayoutNote => ({
        kind: 'placeMissing',
        name,
        place,
      }));
      if (unmetHint === undefined) return missing;
      return [
        ...missing,
        { kind: 'hintMissed', name, hint: unmetHint, zone: compassZoneAt(site, centre) },
      ];
    },
  );
}

function unplacedNotes(layout: Layout): LayoutNote[] {
  const counts = new Map<string, number>();
  layout.placement.unplaced.forEach(({ entry }) => {
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  });
  return [...counts].map(([name, count]) => ({ kind: 'notPlaced', name, count }));
}

function canopyNotes(layout: Layout): LayoutNote[] {
  const { canopyTarget, canopyBefore, trees } = layout;
  const wanted = canopyTarget > canopyBefore + CANOPY_TOLERANCE_PERCENT;
  const short = trees.canopyPercent < canopyTarget - CANOPY_TOLERANCE_PERCENT;
  return wanted && short
    ? [{ kind: 'canopyShort', percent: trees.canopyPercent, target: canopyTarget }]
    : [];
}

/** What the resident should know about one layout: hints missed, misfits and short canopy. */
export function layoutNotes(site: Site, layout: Layout): LayoutNote[] {
  return [
    ...placementNotes(site, layout),
    ...unplacedNotes(layout),
    ...layout.placement.stayed.map(({ entry }): LayoutNote => ({
      kind: 'stayed',
      name: entry.name,
    })),
    ...layout.paths.unreached.map((name): LayoutNote => ({ kind: 'unreached', name })),
    ...canopyNotes(layout),
  ];
}
