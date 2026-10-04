/**
 * The window property where the inline script in index.html leaves the vote queue request it
 * starts with the HTML. Starting it there lets the first poster download beside the entry chunk
 * instead of after it. The script and this module are the only two places that use the name.
 */
export const EARLY_QUEUE_KEY = 'parkshapeEarlyQueue';

interface EarlyQueue {
  /** The project id as it appears in the URL path. */
  readonly projectId: string;
  /** The parsed queue, or null when the request failed or was not OK. */
  readonly queue: PromiseLike<unknown>;
}

function isEarlyQueue(value: unknown): value is EarlyQueue {
  if (typeof value !== 'object' || value === null) return false;
  const queue: unknown = Reflect.get(value, 'queue');
  return (
    typeof Reflect.get(value, 'projectId') === 'string' &&
    typeof queue === 'object' &&
    queue !== null &&
    typeof Reflect.get(queue, 'then') === 'function'
  );
}

/**
 * The queue that index.html started for this project, taken once, or else `load()`. A failed
 * early request also falls back to `load()`, so its error keeps the API client's error kind.
 */
export async function earlyQueueOr<T>(
  scope: object,
  projectId: string,
  load: () => Promise<T>,
): Promise<T> {
  const early: unknown = Reflect.get(scope, EARLY_QUEUE_KEY);
  if (!isEarlyQueue(early) || early.projectId !== encodeURIComponent(projectId)) {
    return load();
  }
  Reflect.deleteProperty(scope, EARLY_QUEUE_KEY);
  const queue = await early.queue;
  // The body is the API's own queue JSON, read the same way the API client reads it.
  return queue === null ? load() : (queue as T);
}
