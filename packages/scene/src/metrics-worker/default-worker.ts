import type { WorkerLike } from './protocol.js';

/**
 * The Vite-bundled metrics worker, or null where Web Workers are missing, such as jsdom tests and
 * old browsers. The `new URL` form lets Vite split the worker into its own chunk.
 */
export function createDefaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}
