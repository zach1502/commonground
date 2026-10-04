import type { ScenePalette } from '@parkshape/scene/plan';

import type { Design, DesignSummary, Project } from '../../api/web-api';

import type { DrawPlan } from './plan-drawing';
import type { PosterSource } from './vote-poster';

export interface PosterInput {
  /** The design on the card: a queue summary, or the full baseline when comparing. */
  readonly summary: Pick<DesignSummary, 'id' | 'title' | 'thumbnailUrl'> | null;
  /** The full design with its document, once it has loaded. */
  readonly full: Design | null;
  readonly project: Project;
  readonly palette: ScenePalette;
  /** The lazily loaded plan drawing; null until its module arrives. */
  readonly drawPlan: DrawPlan | null;
}

/**
 * The picture for the vote card: the stored thumbnail, or else a flat plan drawn from the design.
 * Null means the design or the drawing code is still loading. A null thumbnailUrl means it cannot
 * be drawn. A stored thumbnail needs neither, so the first card loads no schema code.
 */
export function posterFor(input: PosterInput): PosterSource | null {
  const { summary, full, project, palette, drawPlan } = input;
  if (summary === null) return null;
  const { title, thumbnailUrl } = summary;
  if (thumbnailUrl !== null) return { title, thumbnailUrl };
  if (full?.id !== summary.id || drawPlan === null) return null;
  return { title, thumbnailUrl: drawPlan(full.document, project.parcel, palette) };
}
