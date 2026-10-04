import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createVisitStore } from './visit-ranks';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & {
  readonly items: Map<string, string>;
} {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('createVisitStore', () => {
  it('has nothing for a project the reader has not seen', () => {
    expect(createVisitStore(memoryStorage()).read('jrp')).toBeNull();
  });

  it('keeps the last ranks shown per project, with the flag unset', () => {
    const store = createVisitStore(memoryStorage());
    store.saveRanks(
      'jrp',
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(store.read('jrp')).toEqual({
      ranks: new Map([
        ['a', 1],
        ['b', 2],
      ]),
      votedSinceLastVisit: false,
    });
    expect(store.read('other')).toBeNull();
  });

  it('sets the voted flag beside the ranks and clears it after the reorder', () => {
    const store = createVisitStore(memoryStorage());
    store.saveRanks('jrp', new Map([['a', 1]]));
    store.markVoted('jrp');
    expect(store.read('jrp')?.votedSinceLastVisit).toBe(true);
    store.saveRanks('jrp', new Map([['a', 2]]));
    expect(store.read('jrp')?.votedSinceLastVisit).toBe(true);
    store.clearVoted('jrp');
    expect(store.read('jrp')).toEqual({ ranks: new Map([['a', 2]]), votedSinceLastVisit: false });
  });
});

describe('createVisitStore edge cases', () => {
  it('marks a vote before any visit, with no ranks yet', () => {
    const store = createVisitStore(memoryStorage());
    store.markVoted('jrp');
    expect(store.read('jrp')).toEqual({ ranks: new Map(), votedSinceLastVisit: true });
  });

  it('treats a damaged entry as no visit', () => {
    const storage = memoryStorage();
    storage.setItem('parkshape.leaderboard.jrp', '{"ranks":[["a","x"]]');
    expect(createVisitStore(storage).read('jrp')).toBeNull();
    storage.setItem(
      'parkshape.leaderboard.jrp',
      '{"ranks":{"a":"one"},"votedSinceLastVisit":true}',
    );
    expect(createVisitStore(storage).read('jrp')).toBeNull();
  });

  it('keeps working when storage throws, as in a locked-down browser', () => {
    const store = createVisitStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => {
      store.markVoted('jrp');
    }).not.toThrow();
    expect(store.read('jrp')).toBeNull();
  });
});

describe('createVisitStore on the vote route', () => {
  it('parses without zod, which would add its chunk before the vote poster paints', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'visit-ranks.ts'), 'utf8');
    expect(source).not.toMatch(/from 'zod'/);
  });
});
