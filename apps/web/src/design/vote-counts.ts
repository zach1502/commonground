import { useState } from 'react';

import type { Design } from '../api/web-api';

interface VoteCounts {
  readonly up: number;
  readonly down: number;
}

/**
 * The design as the byline shows it: the loaded counts until the visitor votes, then the counts
 * the server sent back with the vote, so a vote, a change and a withdraw move the line at once.
 */
export function useVoteCounts(design: Design): {
  readonly shown: Design;
  readonly update: (counts: VoteCounts) => void;
} {
  const [latest, setLatest] = useState<{ readonly id: string; readonly counts: VoteCounts } | null>(
    null,
  );
  const counts = latest?.id === design.id ? latest.counts : null;
  return {
    shown: counts === null ? design : { ...design, ...counts },
    update: (next) => {
      setLatest({ id: design.id, counts: { up: next.up, down: next.down } });
    },
  };
}
