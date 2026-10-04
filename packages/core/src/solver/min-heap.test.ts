import { describe, expect, it } from 'vitest';

import { MinHeap } from './min-heap.js';

describe('MinHeap', () => {
  it('pops the lowest priority first and equal priorities in push order', () => {
    const heap = new MinHeap();
    [
      [10, 3],
      [11, 1],
      [12, 2],
      [13, 1],
      [14, 0],
    ].forEach(([value, priority]) => {
      heap.push(value ?? 0, priority ?? 0);
    });
    expect(heap.size).toBe(5);
    const popped = [heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()];
    expect(popped).toEqual([14, 11, 13, 12, 10, undefined]);
  });
});
