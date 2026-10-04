import { describe, expect, it } from 'vitest';

import { DEMO_VOTES, runScoringDemo, startingDesigns } from './demo.js';

function capture(): string[] {
  const lines: string[] = [];
  runScoringDemo((line) => {
    lines.push(line);
  });
  return lines;
}

describe('runScoringDemo', () => {
  it('streams 10 votes', () => {
    expect(DEMO_VOTES).toHaveLength(10);
    expect(capture().filter((line) => line.startsWith('Vote '))).toHaveLength(10);
  });

  it('prints the starting leaderboard and one after each vote', () => {
    const boards = capture().filter((line) => line.startsWith('  1. '));
    expect(boards).toHaveLength(DEMO_VOTES.length + 1);
  });

  it('shows at least one design changing place', () => {
    expect(capture().some((line) => line.includes('moves from'))).toBe(true);
  });

  it('only votes on designs that exist', () => {
    const ids = new Set(startingDesigns.map((design) => design.id));
    expect(DEMO_VOTES.every((vote) => ids.has(vote.designId))).toBe(true);
  });

  it('prints the same output every run', () => {
    expect(capture()).toEqual(capture());
  });
});

// The whole transcript: tallies, vote order, scores to 3 places and every "moves from" line.
// Equal scores show the tie-break: Salmon creek (16 votes) ranks above Meadow loop (6 votes).
const TRANSCRIPT = [
  'Score = (up + 2) / (up + down + 4)',
  'Starting leaderboard',
  '  1. Play hill       0.714  (3 up, 0 down)',
  '  2. Salmon creek    0.700  (12 up, 4 down)',
  '  3. Meadow loop     0.700  (5 up, 1 down)',
  '  4. Shade grove     0.647  (20 up, 10 down)',
  '',
  'Vote 1: down for Play hill',
  '  1. Salmon creek    0.700  (12 up, 4 down)',
  '  2. Meadow loop     0.700  (5 up, 1 down)',
  '  3. Shade grove     0.647  (20 up, 10 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '  Salmon creek moves from 2 to 1.',
  '  Meadow loop moves from 3 to 2.',
  '  Shade grove moves from 4 to 3.',
  '',
  'Vote 2: up for Meadow loop',
  '  1. Meadow loop     0.727  (6 up, 1 down)',
  '  2. Salmon creek    0.700  (12 up, 4 down)',
  '  3. Shade grove     0.647  (20 up, 10 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '  Meadow loop moves from 2 to 1.',
  '',
  'Vote 3: up for Shade grove',
  '  1. Meadow loop     0.727  (6 up, 1 down)',
  '  2. Salmon creek    0.700  (12 up, 4 down)',
  '  3. Shade grove     0.657  (21 up, 10 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '',
  'Vote 4: up for Meadow loop',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Salmon creek    0.700  (12 up, 4 down)',
  '  3. Shade grove     0.657  (21 up, 10 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '',
  'Vote 5: down for Salmon creek',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Salmon creek    0.667  (12 up, 5 down)',
  '  3. Shade grove     0.657  (21 up, 10 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '',
  'Vote 6: up for Shade grove',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Shade grove     0.667  (22 up, 10 down)',
  '  3. Salmon creek    0.667  (12 up, 5 down)',
  '  4. Play hill       0.625  (3 up, 1 down)',
  '  Shade grove moves from 3 to 2.',
  '',
  'Vote 7: up for Play hill',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Shade grove     0.667  (22 up, 10 down)',
  '  3. Salmon creek    0.667  (12 up, 5 down)',
  '  4. Play hill       0.667  (4 up, 1 down)',
  '',
  'Vote 8: up for Shade grove',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Shade grove     0.676  (23 up, 10 down)',
  '  3. Salmon creek    0.667  (12 up, 5 down)',
  '  4. Play hill       0.667  (4 up, 1 down)',
  '',
  'Vote 9: up for Salmon creek',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Salmon creek    0.682  (13 up, 5 down)',
  '  3. Shade grove     0.676  (23 up, 10 down)',
  '  4. Play hill       0.667  (4 up, 1 down)',
  '  Salmon creek moves from 3 to 2.',
  '',
  'Vote 10: up for Shade grove',
  '  1. Meadow loop     0.750  (7 up, 1 down)',
  '  2. Shade grove     0.684  (24 up, 10 down)',
  '  3. Salmon creek    0.682  (13 up, 5 down)',
  '  4. Play hill       0.667  (4 up, 1 down)',
  '  Shade grove moves from 3 to 2.',
];

describe('runScoringDemo transcript', () => {
  it('prints the formula, each leaderboard and each move exactly', () => {
    expect(capture()).toEqual(TRANSCRIPT);
  });
});
