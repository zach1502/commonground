import { describe, expect, it } from 'vitest';

import { swipeAction, SWIPE_THRESHOLD_PX } from './swipe';

const origin = { x: 100, y: 100 };
const PAST = SWIPE_THRESHOLD_PX + 1;

describe('swipeAction', () => {
  it('reads a rightward swipe as an up vote', () => {
    expect(swipeAction(origin, { x: origin.x + PAST, y: origin.y })).toBe('up');
  });

  it('reads a leftward swipe as a down vote', () => {
    expect(swipeAction(origin, { x: origin.x - PAST, y: origin.y })).toBe('down');
  });

  it('reads an upward swipe as skip', () => {
    expect(swipeAction(origin, { x: origin.x, y: origin.y - PAST })).toBe('skip');
  });

  it('ignores a downward drag', () => {
    expect(swipeAction(origin, { x: origin.x, y: origin.y + PAST })).toBeNull();
  });

  it('ignores travel under the threshold', () => {
    expect(swipeAction(origin, { x: origin.x + 10, y: origin.y - 10 })).toBeNull();
  });
});
