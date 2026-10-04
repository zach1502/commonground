import type { QueuePoster } from '../../api/web-api';

/**
 * Adds a high-priority image preload for the first vote card to the page head, so the browser
 * starts the download while React is still rendering. One link per picture.
 */
export function preloadPoster(head: HTMLElement, poster: QueuePoster | null): void {
  if (poster === null) return;
  const links = head.querySelectorAll('link[rel="preload"][as="image"]');
  if ([...links].some((link) => link.getAttribute('href') === poster.url)) return;
  const link = head.ownerDocument.createElement('link');
  link.setAttribute('rel', 'preload');
  link.setAttribute('as', 'image');
  link.setAttribute('href', poster.url);
  link.setAttribute('fetchpriority', 'high');
  head.append(link);
}
