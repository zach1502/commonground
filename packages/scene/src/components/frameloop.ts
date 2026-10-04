export type Frameloop = 'always' | 'demand';

/**
 * The viewer draws only after a change, so an open 3D view does not keep the main thread busy.
 * The dev page frame counter needs a steady stream of frames, so it switches the loop back on.
 */
export function frameloopFor(onFrameTime: ((frameMs: number) => void) | undefined): Frameloop {
  return onFrameTime === undefined ? 'demand' : 'always';
}
