import { lazy, Suspense } from 'react';

import { VisuallyHidden } from '@parkshape/ui';

import type { Design, Project } from '../../api/web-api';
import type { ContextApi } from '../../design/use-project-context';
import type { TerrainApi } from '../../design/use-project-terrain';
import { messages } from '../../messages';

import { voteViewSummary } from './vote-summary';
import type { VoteWalk } from './vote-viewer';
import { loadVoteViewer } from './vote-warm';

const VoteViewer = lazy(async () => ({ default: (await loadVoteViewer()).VoteViewer }));

export interface VoteModelProps {
  /** The full design with its document; null while it is still loading. */
  readonly shown: Design | null;
  readonly project: Project;
  readonly api: TerrainApi & ContextApi;
  /** Set while the voter walks the park from the card. */
  readonly walk?: VoteWalk | undefined;
}

/** The lazy 3D view of one design. Only mounted after the voter asks for it. */
export function VoteModel({ shown, project, api, walk }: VoteModelProps) {
  const loading = <p className="web-vote__poster-note">{messages.vote.loading}</p>;
  if (shown === null) return loading;
  return (
    <Suspense fallback={loading}>
      <VisuallyHidden>{voteViewSummary(shown)}</VisuallyHidden>
      <VoteViewer design={shown} project={project} api={api} walk={walk} />
    </Suspense>
  );
}
