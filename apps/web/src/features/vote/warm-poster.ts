import { useCallback, useRef } from 'react';

import type { DesignSummary } from '../../api/web-api';

/**
 * Starts the download of a picture at low priority and decodes it, so the next vote card's
 * picture is ready to paint in the frame the card changes. The image is never added to the page.
 */
export function warmPoster(doc: Document, url: string | null): HTMLImageElement | null {
  if (url === null) return null;
  const image = doc.createElement('img');
  image.decoding = 'async';
  image.setAttribute('fetchpriority', 'low');
  image.setAttribute('src', url);
  // A failed decode leaves the card to load the picture itself, as it would with no warm-up.
  if (typeof image.decode === 'function') image.decode().catch(() => undefined);
  return image;
}

/**
 * Returns the handler for the card picture's load event: it warms the next design's picture,
 * once per design, so the first card's picture never shares the network with it.
 */
export function useWarmNextPoster(
  candidates: readonly Pick<DesignSummary, 'id' | 'thumbnailUrl'>[],
  index: number,
): () => void {
  const warmed = useRef(new Map<string, HTMLImageElement | null>());
  return useCallback(() => {
    const next = candidates[index + 1];
    if (next === undefined || warmed.current.has(next.id)) return;
    warmed.current.set(next.id, warmPoster(document, next.thumbnailUrl));
  }, [candidates, index]);
}
