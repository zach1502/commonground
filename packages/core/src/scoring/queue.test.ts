import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { QUEUE_BATCH_SIZE, QUEUE_UNDER_VOTED_SHARE } from '../constants.js';

import { pickQueue, splitUnderVoted, type QueueCandidate } from './queue.js';

const DRAWS = 2000;
const SHARE_TOLERANCE = 0.05;
const POOL_SIZE = 20;
const MAX_POOL_VOTES = 50;

function candidate(id: string, up: number, down = 0): QueueCandidate {
  return { id, up, down, authorId: `author-${id}` };
}

function poolOf(voteCounts: readonly number[]): QueueCandidate[] {
  return voteCounts.map((votes, index) => candidate(`d${String(index)}`, votes));
}

const options = (seed: number) => ({
  underVotedShare: QUEUE_UNDER_VOTED_SHARE,
  random: createSeededRandom(seed),
});

describe('splitUnderVoted', () => {
  it('puts designs below the median vote count in the under-voted group', () => {
    const split = splitUnderVoted(poolOf([0, 1, 4, 9, 10]), createSeededRandom(1));
    expect(split.underVoted.map((design) => design.id).sort()).toEqual(['d0', 'd1']);
    expect(split.rest.map((design) => design.id).sort()).toEqual(['d2', 'd3', 'd4']);
  });

  it('uses the average of the middle two counts for an even pool', () => {
    const split = splitUnderVoted(poolOf([0, 2, 6, 8]), createSeededRandom(1));
    expect(split.underVoted.map((design) => design.id).sort()).toEqual(['d0', 'd1']);
  });

  it('counts down votes as votes', () => {
    const pool = [candidate('a', 0, 9), candidate('b', 1), candidate('c', 5)];
    const split = splitUnderVoted(pool, createSeededRandom(1));
    expect(split.underVoted.map((design) => design.id)).toEqual(['b']);
  });

  it('takes the lowest-count half when ties leave nothing below the median', () => {
    const split = splitUnderVoted(poolOf([0, 0, 0, 7]), createSeededRandom(1));
    expect(split.underVoted).toHaveLength(2);
    expect(split.underVoted.every((design) => design.up === 0)).toBe(true);
  });

  it('picks the tied half at random, so no design is always favoured', () => {
    const tiedPool = poolOf([0, 0, 0, 0]);
    const chosen = new Set<string>();
    for (let seed = 0; seed < POOL_SIZE; seed += 1) {
      for (const design of splitUnderVoted(tiedPool, createSeededRandom(seed)).underVoted) {
        chosen.add(design.id);
      }
    }
    expect(chosen.size).toBe(tiedPool.length);
  });

  it('puts only the designs below an odd median in the under-voted group, not half the pool', () => {
    // Median of [0, 5, 5, 5, 5] is 5, so only d0 is under-voted; half the pool would be 2.
    const split = splitUnderVoted(poolOf([0, 5, 5, 5, 5]), createSeededRandom(1));
    expect(split.underVoted.map((design) => design.id)).toEqual(['d0']);
    expect(split.rest).toHaveLength(4);
  });

  it('uses the even-pool median when it leaves fewer than half below it', () => {
    // Median of [0, 1, 3, 3, 3, 3] is 3, so d0 and d1 are under-voted; half the pool would be 3.
    const split = splitUnderVoted(poolOf([0, 1, 3, 3, 3, 3]), createSeededRandom(1));
    expect(split.underVoted.map((design) => design.id).sort()).toEqual(['d0', 'd1']);
  });

  it('returns empty groups for an empty pool', () => {
    expect(splitUnderVoted([], createSeededRandom(1))).toEqual({ underVoted: [], rest: [] });
  });
});

describe('pickQueue', () => {
  it('returns nothing for no candidates', () => {
    expect(pickQueue([], new Set(), QUEUE_BATCH_SIZE, options(1))).toEqual([]);
  });

  it('returns nothing when n is 0', () => {
    expect(pickQueue(poolOf([0, 1, 2]), new Set(), 0, options(1))).toEqual([]);
  });

  it('returns a single candidate', () => {
    const queue = pickQueue([candidate('only', 3)], new Set(), QUEUE_BATCH_SIZE, options(1));
    expect(queue.map((design) => design.id)).toEqual(['only']);
  });

  it('returns every candidate once when there are fewer than n', () => {
    const queue = pickQueue(poolOf([0, 5, 9]), new Set(), QUEUE_BATCH_SIZE, options(1));
    expect(queue.map((design) => design.id).sort()).toEqual(['d0', 'd1', 'd2']);
  });

  it('never returns an excluded design', () => {
    const excluded = new Set(['d0', 'd1', 'd2']);
    for (let seed = 0; seed < POOL_SIZE; seed += 1) {
      const queue = pickQueue(
        poolOf([0, 0, 0, 5, 6, 7]),
        excluded,
        QUEUE_BATCH_SIZE,
        options(seed),
      );
      expect(queue.some((design) => excluded.has(design.id))).toBe(false);
    }
  });

  it('returns nothing when every candidate is excluded', () => {
    const excluded = new Set(['d0', 'd1']);
    expect(pickQueue(poolOf([0, 1]), excluded, QUEUE_BATCH_SIZE, options(1))).toEqual([]);
  });
});

describe('pickQueue batch mix', () => {
  it('fills round(n x share) slots from the under-voted group', () => {
    const pool = poolOf([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    const underIds = new Set(
      splitUnderVoted(pool, createSeededRandom(1)).underVoted.map((d) => d.id),
    );
    const tenQueue = pickQueue(pool, new Set(), 10, options(3));
    expect(tenQueue.filter((design) => underIds.has(design.id))).toHaveLength(7);
    // round(5 x 0.7) = round(3.5) = 4, so the default batch serves 4 under-voted designs.
    const batch = pickQueue(pool, new Set(), QUEUE_BATCH_SIZE, options(3));
    expect(batch.filter((design) => underIds.has(design.id))).toHaveLength(4);
  });

  it('tops up from the under-voted group when the rest runs out', () => {
    const pool = poolOf([0, 0, 0, 0, 0, 0, 0, 0, 9, 9]);
    expect(pickQueue(pool, new Set(), 10, options(2))).toHaveLength(10);
  });

  it('gives the same queue for the same seed', () => {
    const pool = poolOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const first = pickQueue(pool, new Set(), QUEUE_BATCH_SIZE, options(42));
    expect(pickQueue(pool, new Set(), QUEUE_BATCH_SIZE, options(42))).toEqual(first);
  });

  it('shuffles the final order so under-voted designs are not always first', () => {
    const pool = poolOf([0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9]);
    const firstIsVoted = Array.from({ length: POOL_SIZE }, (_, seed) => {
      const [first] = pickQueue(pool, new Set(), 10, options(seed));
      return (first?.up ?? 0) > 0;
    });
    expect(firstIsVoted).toContain(true);
    expect(firstIsVoted).toContain(false);
  });

  it('rejects an n that is negative or fractional', () => {
    expect(() => pickQueue(poolOf([0]), new Set(), -1, options(1))).toThrow(RangeError);
    expect(() => pickQueue(poolOf([0]), new Set(), 1.5, options(1))).toThrow(RangeError);
  });

  it('rejects an under-voted share outside 0 to 1', () => {
    const random = createSeededRandom(1);
    expect(() => pickQueue(poolOf([0]), new Set(), 1, { underVotedShare: 1.2, random })).toThrow(
      RangeError,
    );
  });
});

describe('pickQueue share bounds', () => {
  // Median of six 0s and four 9s is 0, so nothing is below it and the fallback takes the
  // lowest half: 5 designs, all with 0 votes.
  const pool = poolOf([0, 0, 0, 0, 0, 0, 9, 9, 9, 9]);

  it('accepts a share of exactly 1 and fills every slot from the under-voted group', () => {
    const queue = pickQueue(pool, new Set(), 5, {
      underVotedShare: 1,
      random: createSeededRandom(4),
    });
    expect(queue).toHaveLength(5);
    expect(queue.every((design) => design.up === 0)).toBe(true);
  });

  it('accepts a share of exactly 0', () => {
    const queue = pickQueue(pool, new Set(), 4, {
      underVotedShare: 0,
      random: createSeededRandom(4),
    });
    expect(queue).toHaveLength(4);
  });

  it('rejects a share just under 0', () => {
    const random = createSeededRandom(1);
    expect(() => pickQueue(pool, new Set(), 4, { underVotedShare: -0.01, random })).toThrow(
      RangeError,
    );
  });
});

describe('pickQueue statistics', () => {
  it(`serves under-voted designs ${String(QUEUE_UNDER_VOTED_SHARE)} of the time over ${String(DRAWS)} seeded draws`, () => {
    const poolRandom = createSeededRandom(2026);
    const batchSize = 10;
    let underServed = 0;
    let served = 0;
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const pool = poolOf(
        Array.from({ length: POOL_SIZE }, () => Math.floor(poolRandom.next() * MAX_POOL_VOTES)),
      );
      const underIds = new Set(
        splitUnderVoted(pool, createSeededRandom(draw)).underVoted.map((design) => design.id),
      );
      const queue = pickQueue(pool, new Set(), batchSize, options(draw));
      underServed += queue.filter((design) => underIds.has(design.id)).length;
      served += queue.length;
    }
    expect(Math.abs(underServed / served - QUEUE_UNDER_VOTED_SHARE)).toBeLessThanOrEqual(
      SHARE_TOLERANCE,
    );
  });

  it('picks each under-voted design about equally often', () => {
    const pool = poolOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    const counts = new Map<string, number>();
    for (let draw = 0; draw < DRAWS; draw += 1) {
      for (const design of pickQueue(pool, new Set(), QUEUE_BATCH_SIZE, options(draw))) {
        if (design.up === 0) counts.set(design.id, (counts.get(design.id) ?? 0) + 1);
      }
    }
    // 4 of 10 under-voted designs per batch, so each expects 800 picks in 2000 draws.
    const expected = (DRAWS * 4) / 10;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.1);
    }
    expect(counts.size).toBe(10);
  });
});

describe('pickQueue properties', () => {
  const poolArbitrary = fc.uniqueArray(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 6 }),
      up: fc.nat({ max: 30 }),
      down: fc.nat({ max: 30 }),
    }),
    { selector: (design) => design.id, maxLength: 40 },
  );

  it('never returns duplicates or excluded designs, and returns min(n, available)', () => {
    fc.assert(
      fc.property(
        fc.record({
          drafts: poolArbitrary,
          excludedIndexes: fc.array(fc.nat({ max: 39 })),
          n: fc.nat({ max: 50 }),
          underVotedShare: fc.double({ min: 0, max: 1, noNaN: true }),
          seed: fc.integer(),
        }),
        ({ drafts, excludedIndexes, n, underVotedShare, seed }) => {
          const pool = drafts.map((draft) => ({ ...draft, authorId: 'author' }));
          const excluded = new Set(excludedIndexes.flatMap((index) => pool[index]?.id ?? []));
          const random = createSeededRandom(seed);
          const queue = pickQueue(pool, excluded, n, { underVotedShare, random });
          const queueIds = queue.map((design) => design.id);
          const available = pool.filter((design) => !excluded.has(design.id)).length;
          expect(new Set(queueIds).size).toBe(queueIds.length);
          expect(queueIds.some((id) => excluded.has(id))).toBe(false);
          expect(queue.length).toBe(Math.min(n, available));
        },
      ),
    );
  });
});
