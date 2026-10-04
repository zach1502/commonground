import { DEFAULT_SCORE_PRIOR } from '../constants.js';

import { rankDesigns, type RankedDesign } from './rank.js';

interface DemoDesign {
  readonly id: string;
  readonly title: string;
  readonly up: number;
  readonly down: number;
}

interface DemoVote {
  readonly designId: string;
  readonly direction: 'up' | 'down';
}

const SCORE_DECIMALS = 3;
const TITLE_COLUMN = 16;

// Starting tallies, one named constant per design so each vote count sits next to its title.
const SALMON_CREEK: DemoDesign = { id: 'salmon-creek', title: 'Salmon creek', up: 12, down: 4 };
const MEADOW_LOOP: DemoDesign = { id: 'meadow-loop', title: 'Meadow loop', up: 5, down: 1 };
const PLAY_HILL: DemoDesign = { id: 'play-hill', title: 'Play hill', up: 3, down: 0 };
const SHADE_GROVE: DemoDesign = { id: 'shade-grove', title: 'Shade grove', up: 20, down: 10 };

export const startingDesigns: readonly DemoDesign[] = [
  SALMON_CREEK,
  MEADOW_LOOP,
  PLAY_HILL,
  SHADE_GROVE,
];

export const DEMO_VOTES: readonly DemoVote[] = [
  { designId: 'play-hill', direction: 'down' },
  { designId: 'meadow-loop', direction: 'up' },
  { designId: 'shade-grove', direction: 'up' },
  { designId: 'meadow-loop', direction: 'up' },
  { designId: 'salmon-creek', direction: 'down' },
  { designId: 'shade-grove', direction: 'up' },
  { designId: 'play-hill', direction: 'up' },
  { designId: 'shade-grove', direction: 'up' },
  { designId: 'salmon-creek', direction: 'up' },
  { designId: 'shade-grove', direction: 'up' },
];

function applyVote(designs: readonly DemoDesign[], vote: DemoVote): DemoDesign[] {
  return designs.map((design) =>
    design.id === vote.designId
      ? { ...design, [vote.direction]: design[vote.direction] + 1 }
      : design,
  );
}

function boardLines(board: readonly RankedDesign<DemoDesign>[]): string[] {
  return board.map(
    (design, index) =>
      `  ${String(index + 1)}. ${design.title.padEnd(TITLE_COLUMN)}` +
      `${design.score.toFixed(SCORE_DECIMALS)}  (${String(design.up)} up, ${String(design.down)} down)`,
  );
}

function moveLines(
  before: readonly RankedDesign<DemoDesign>[],
  after: readonly RankedDesign<DemoDesign>[],
): string[] {
  return after.flatMap((design, index) => {
    const oldIndex = before.findIndex((previous) => previous.id === design.id);
    if (oldIndex <= index) return [];
    return [`  ${design.title} moves from ${String(oldIndex + 1)} to ${String(index + 1)}.`];
  });
}

/** Prints the leaderboard, then streams the demo votes and prints each reorder. */
export function runScoringDemo(print: (line: string) => void): void {
  let designs: readonly DemoDesign[] = startingDesigns;
  let board = rankDesigns(designs, DEFAULT_SCORE_PRIOR);
  const { up, down } = DEFAULT_SCORE_PRIOR;
  print(`Score = (up + ${String(up)}) / (up + down + ${String(up + down)})`);
  print('Starting leaderboard');
  boardLines(board).forEach(print);
  DEMO_VOTES.forEach((vote, index) => {
    designs = applyVote(designs, vote);
    const next = rankDesigns(designs, DEFAULT_SCORE_PRIOR);
    const title = designs.find((design) => design.id === vote.designId)?.title ?? vote.designId;
    print('');
    print(`Vote ${String(index + 1)}: ${vote.direction} for ${title}`);
    boardLines(next).forEach(print);
    moveLines(board, next).forEach(print);
    board = next;
  });
}
