import { describe, expect, it } from 'vitest';

import { syntheticDesign } from './fixtures.js';
import { reasonFrequency } from './reasons.js';
import type { InsightVote } from './types.js';

const designs = [syntheticDesign({ id: 'a' }), syntheticDesign({ id: 'b' })];
const votes: InsightVote[] = [
  { designId: 'a', userId: 'u1', value: 1, reasons: ['play', 'trees'] },
  { designId: 'a', userId: 'u2', value: 1, reasons: ['trees'] },
  { designId: 'b', userId: 'u1', value: -1, reasons: ['too-expensive'] },
  { designId: 'b', userId: 'u3', value: -1, reasons: [] },
  // A vote on a design that is no longer live still counts toward the project total.
  { designId: 'gone', userId: 'u4', value: -1, reasons: ['trees'] },
];

describe('reasonFrequency', () => {
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const frequency = () => reasonFrequency(designs, votes);
  const count = (rows: readonly { reason: string; count: number }[], reason: string) =>
    rows.find((row) => row.reason === reason)?.count;

  it('counts each reason across every vote in the project', () => {
    expect(count(frequency().overall, 'trees')).toBe(3);
    expect(count(frequency().overall, 'play')).toBe(1);
    expect(count(frequency().overall, 'water')).toBe(0);
    expect(frequency().overall).toHaveLength(10);
  });

  it('counts the reasons given with up votes apart from those given with down votes', () => {
    expect(count(frequency().up, 'trees')).toBe(2);
    expect(count(frequency().up, 'too-expensive')).toBe(0);
    expect(count(frequency().down, 'trees')).toBe(1);
    expect(count(frequency().down, 'too-expensive')).toBe(1);
    expect(frequency().down).toHaveLength(10);
  });

  it('counts reasons and votes per live design', () => {
    const [first, second] = frequency().byDesign;
    expect(first).toMatchObject({ designId: 'a', title: 'Design a', votes: 2 });
    expect(count(first?.counts ?? [], 'trees')).toBe(2);
    expect(second).toMatchObject({ designId: 'b', votes: 2 });
    expect(count(second?.counts ?? [], 'too-expensive')).toBe(1);
  });
});
