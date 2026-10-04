import { describe, expect, it } from 'vitest';

import type { Random } from '@parkshape/core';

import { createQueueRandoms } from './queue-random.js';

const draws = (random: Random) => [random.next(), random.next(), random.next()];

describe('createQueueRandoms', () => {
  it('gives the same sequence of generators for the same base seed', () => {
    const first = createQueueRandoms(7);
    const second = createQueueRandoms(7);
    expect(draws(first('user-a'))).toEqual(draws(second('user-a')));
    expect(draws(first('user-a'))).toEqual(draws(second('user-a')));
  });

  it('gives a fresh generator on each call for the same user', () => {
    const randoms = createQueueRandoms(7);
    expect(draws(randoms('user-a'))).not.toEqual(draws(randoms('user-a')));
  });

  it('gives different users different generators', () => {
    const randoms = createQueueRandoms(7);
    expect(draws(randoms('user-a'))).not.toEqual(draws(randoms('user-b')));
  });
});
