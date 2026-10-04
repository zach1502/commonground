import { describe, expect, it } from 'vitest';

import { rankDesigns } from '@parkshape/core';

import { seedPeople } from './personas.js';
import { planVotes, TOP_COUNT, type PlannedVote, type VoteTarget } from './votes.js';

const DESIGN_COUNT = 30;
const PRIOR = { up: 2, down: 2 };

function targets(residents: readonly { id: string }[]): VoteTarget[] {
  return Array.from({ length: DESIGN_COUNT }, (_, index) => ({
    key: `design-${String(index)}`,
    authorId: residents[index]?.id ?? '',
    tags: index % 2 === 0 ? ['dog', 'paths'] : ['garden'],
  }));
}

function ranked(votes: readonly PlannedVote[], keys: readonly string[]): string[] {
  const designs = keys.map((key) => ({
    id: key,
    up: votes.filter((vote) => vote.designKey === key && vote.value === 1).length,
    down: votes.filter((vote) => vote.designKey === key && vote.value === -1).length,
    submittedAt: new Date(0),
  }));
  return rankDesigns(designs, PRIOR).map(({ id }) => id);
}

describe('planVotes', () => {
  const { residents } = seedPeople();
  const planned = targets(residents);
  const votes = planVotes(planned, residents);

  it('never has anyone vote on their own design or twice on one design', () => {
    for (const target of planned) {
      const voters = votes.filter((vote) => vote.designKey === target.key).map((v) => v.voterId);
      expect(voters).not.toContain(target.authorId);
      expect(new Set(voters).size).toBe(voters.length);
    }
  });

  it('makes the first five targets the top five, in order', () => {
    const order = ranked(
      votes,
      planned.map(({ key }) => key),
    );
    expect(order.slice(0, TOP_COUNT)).toEqual(planned.slice(0, TOP_COUNT).map(({ key }) => key));
  });

  it('gives up votes reasons from the design and is the same on every run', () => {
    const up = votes.filter((vote) => vote.value === 1 && vote.designKey === 'design-0');
    expect(up.every(({ reasons }) => reasons.length > 0)).toBe(true);
    expect(
      up.flatMap(({ reasons }) => reasons).every((r) => ['dog-area', 'paths'].includes(r)),
    ).toBe(true);
    expect(planVotes(planned, residents)).toEqual(votes);
  });

  it('spreads the votes over every resident', () => {
    expect(new Set(votes.map(({ voterId }) => voterId)).size).toBe(residents.length);
  });
});
