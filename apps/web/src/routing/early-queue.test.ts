import { afterEach, describe, expect, it, vi } from 'vitest';

import { EARLY_QUEUE_KEY, earlyQueueOr } from './early-queue';

const QUEUE = { designs: [] };

function scopeWith(projectId: string, queue: unknown): Record<string, unknown> {
  return { [EARLY_QUEUE_KEY]: { projectId, queue: Promise.resolve(queue) } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('earlyQueueOr', () => {
  it('uses the queue index.html started for this project, once', async () => {
    const scope = scopeWith('p1', QUEUE);
    const load = vi.fn().mockResolvedValue({ designs: ['late'] });
    expect(await earlyQueueOr(scope, 'p1', load)).toBe(QUEUE);
    expect(load).not.toHaveBeenCalled();
    expect(scope[EARLY_QUEUE_KEY]).toBeUndefined();
    expect(await earlyQueueOr(scope, 'p1', load)).toEqual({ designs: ['late'] });
  });

  it('loads normally when the early request failed, so errors keep their API kind', async () => {
    const load = vi.fn().mockResolvedValue(QUEUE);
    expect(await earlyQueueOr(scopeWith('p1', null), 'p1', load)).toBe(QUEUE);
    expect(load).toHaveBeenCalledOnce();
  });

  it('compares the project in its URL form', async () => {
    const load = vi.fn();
    expect(await earlyQueueOr(scopeWith('a%20b', QUEUE), 'a b', load)).toBe(QUEUE);
  });

  it('ignores an early queue for another project and a malformed entry', async () => {
    const load = vi.fn().mockResolvedValue(QUEUE);
    const other = scopeWith('p2', { designs: ['other'] });
    expect(await earlyQueueOr(other, 'p1', load)).toBe(QUEUE);
    expect(other[EARLY_QUEUE_KEY]).toBeDefined();
    expect(await earlyQueueOr({ [EARLY_QUEUE_KEY]: 'x' }, 'p1', load)).toBe(QUEUE);
    expect(await earlyQueueOr({}, 'p1', load)).toBe(QUEUE);
  });
});
