export type SwipeAction = 'up' | 'down' | 'skip';

/** Minimum pointer travel, in pixels, before a drag counts as a swipe. */
export const SWIPE_THRESHOLD_PX = 60;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Maps a pointer drag to a vote action: right is an up vote, left is a down vote and up is skip.
 * A downward drag and any drag under the threshold return null, so scrolling does not vote.
 */
export function swipeAction(
  start: Point,
  end: Point,
  threshold: number = SWIPE_THRESHOLD_PX,
): SwipeAction | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
    return null;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'up' : 'down';
  }
  return dy < 0 ? 'skip' : null;
}
