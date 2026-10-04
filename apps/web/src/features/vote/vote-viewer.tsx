import { useMemo } from 'react';

import type { Design, Project } from '../../api/web-api';
import type { ContextApi } from '../../design/use-project-context';
import type { TerrainApi } from '../../design/use-project-terrain';
import { ViewerPanel, type PanelWalk } from '../../design/viewer-panel';
import { itemLabels } from '../review/review-model';

/** A walk the card started; onLeave runs on Escape or Back to overview. */
export interface VoteWalk {
  readonly onLeave: () => void;
}

export interface VoteViewerProps {
  readonly design: Design;
  readonly project: Project;
  readonly api: TerrainApi & ContextApi;
  /** Set while the voter walks the park; the walk starts once the scene has drawn. */
  readonly walk?: VoteWalk | undefined;
}

/** The viewer's walk props for a walk the card started, or none. */
function useCardWalk(
  design: Design,
  project: Project,
  walk: VoteWalk | undefined,
): PanelWalk | undefined {
  const labels = useMemo(
    () => (walk === undefined ? null : itemLabels(design, project)),
    [design, project, walk],
  );
  if (walk === undefined || labels === null) return undefined;
  const onModeChange = (mode: 'walk' | 'overview') => {
    if (mode === 'overview') walk.onLeave();
  };
  return { labels, start: 'on-ready', onModeChange };
}

/**
 * The read-only 3D view of one anonymous design in the voting queue. Loaded on its own. It is
 * the design page's viewer, so it waits for the models index and draws the real GLBs. The
 * default context layers show with no street names, to fit the phone card.
 */
export function VoteViewer({ design, project, api, walk }: VoteViewerProps) {
  return (
    <ViewerPanel
      design={design}
      project={project}
      api={api}
      streets={{ api, names: 'hidden' }}
      walk={useCardWalk(design, project, walk)}
    />
  );
}
