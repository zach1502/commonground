import type { PlacementValidity } from '../editor/placement-validity.js';
import type { Notice, Tool } from '../editor/store/types.js';

import { fill, formatArea, type EditorStrings } from './strings.js';

/** The one-line reason beside a red ghost, or null when the spot is fine. */
export function reasonText(validity: PlacementValidity, strings: EditorStrings): string | null {
  if (validity.valid) return null;
  const name = strings.catalog[validity.label] ?? validity.label;
  const templates = {
    'locked footprint': strings.reasons.lockedFootprint,
    'forbidden zone': strings.reasons.forbiddenZone,
    'too steep': strings.reasons.tooSteep,
    'unknown item': strings.reasons.unknownItem,
    'outside park': strings.reasons.outsidePark,
  } as const;
  return fill(templates[validity.reason], { name });
}

/** Text for the notice line under the tools. */
export function noticeText(
  notice: Notice | null,
  strings: EditorStrings,
  nameOf: (id: string) => string,
): string | null {
  if (notice === null) return null;
  switch (notice.kind) {
    case 'locked':
      return fill(strings.notices.locked, { name: nameOf(notice.id) });
    case 'area-too-small':
      return fill(strings.notices.areaTooSmall, { min: formatArea(notice.minAreaM2) });
    case 'path-too-short':
      return strings.notices.pathTooShort;
    case 'rejected':
      return fill(strings.notices.rejected, {
        reason: reasonText(notice.validity, strings) ?? '',
      });
  }
}

/** The line at the canvas while an item follows the cursor, such as "Placing Bench. Press Esc to stop." */
export function placingText(tool: Tool, strings: EditorStrings): string | null {
  if (tool.kind !== 'place') return null;
  const name = strings.catalog[tool.catalogId] ?? tool.catalogId;
  return fill(strings.notices.placing, { name });
}
