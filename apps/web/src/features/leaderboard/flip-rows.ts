import { fadeIn, flip } from '@parkshape/ui';

/**
 * FLIP for the leaderboard: each row is already in its new place, and the ones whose rank
 * changed slide from the slot they held at the reader's last visit. All rows are measured before
 * any animation starts, so the browser lays out once. Returns how many rows moved.
 */
export function flipRows(
  body: HTMLTableSectionElement,
  previous: ReadonlyMap<string, number>,
): number {
  const rows = Array.from(body.rows);
  const tops = rows.map((row) => row.getBoundingClientRect().top);
  const moves = rows.map((row, index) => {
    const before = previous.get(row.dataset.designId ?? '');
    const from = before === undefined ? undefined : tops[before - 1];
    const here = tops[index] ?? 0;
    return { element: row, fromPx: from === undefined ? 0 : from - here };
  });
  return flip(moves);
}

/** The first view of the board: one reveal on the body, or the reorder the reader's vote caused. */
export function arriveBoard(
  body: HTMLTableSectionElement,
  arrival: { readonly reorder: 'flip' | 'still'; readonly previous: ReadonlyMap<string, number> },
): void {
  if (arrival.reorder === 'flip' && flipRows(body, arrival.previous) > 0) return;
  void fadeIn(body);
}
