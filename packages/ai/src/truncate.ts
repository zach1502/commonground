const ELLIPSIS = '...';

/** Shortens text to at most maxChars characters before it is sent to a model, marking the cut. */
export function truncateForModel(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - ELLIPSIS.length))}${ELLIPSIS}`;
}
