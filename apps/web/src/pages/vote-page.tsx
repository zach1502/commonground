import { useMemo, useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';

import type { Project, Queue } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { withPrefetchedDesign, type PrefetchedDesign } from '../features/vote/prefetch';
import { VoteBatchView } from '../features/vote/vote-batch-view';
import { format, messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';

interface VoteData {
  readonly project: Project;
  readonly queue: Queue;
  readonly prefetched: PrefetchedDesign | null;
}

/**
 * Sets the leaderboard's voted flag. The store loads with the first recorded vote, so its chunk is
 * not one more request before the vote poster paints.
 */
async function markVoted(session: Storage, projectId: string): Promise<void> {
  const { createVisitStore } = await import('../features/leaderboard/visit-ranks');
  createVisitStore(session).markVoted(projectId);
}

/** The voting route: one anonymous design at a time, in batches of five. */
export function VotePage({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'editor'> }) {
  const { project, queue, prefetched } = useLoaderData<VoteData>();
  const api = useMemo(() => withPrefetchedDesign(deps.api, prefetched), [deps.api, prefetched]);
  const session = deps.editor.storage.session;
  const revalidator = useRevalidator();
  const [batchKey, setBatchKey] = useState(0);
  useDocumentMeta({
    title: messages.meta.vote.title,
    description: format(messages.meta.vote.description, { name: project.name }),
    image: null,
  });
  const onVoteMore = () => {
    setBatchKey((key) => key + 1);
    void revalidator.revalidate();
  };
  return (
    <div className="web-vote">
      <VoteBatchView
        key={batchKey}
        api={api}
        project={project}
        candidates={queue.designs}
        baselineDesignId={queue.baselineDesignId}
        lead={queue.poster}
        onVoteMore={onVoteMore}
        onVoteRecorded={() => {
          void markVoted(session, project.id);
        }}
      />
    </div>
  );
}
