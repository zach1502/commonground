// The three.js viewer chunk. The module loader caches the import, so the warm-up on first touch
// and the lazy mount share one download.
export const loadVoteViewer = () => import('./vote-viewer');

/** Starts the three.js download early, on the voter's first touch, without mounting anything. */
export function warmVoteModel(): void {
  void loadVoteViewer();
}
