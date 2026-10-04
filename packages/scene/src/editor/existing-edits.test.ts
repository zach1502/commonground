import { describe, expect, it } from 'vitest';

import {
  insertPathVertex,
  moveAreaVertex,
  movePathVertex,
  resizeArea,
  toCommand,
} from './commands.js';
import { docOf, square } from './test-fixtures.js';

/** The park as it is today: an existing gravel path and an existing garden. */
const today = docOf({
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      existing: true,
    },
  ],
  areas: [
    {
      id: 'a1',
      catalogId: 'community-garden',
      polygon: square(30, 30, 10),
      locked: false,
      existing: true,
    },
  ],
});

const applied = (spec: Parameters<typeof toCommand>[0]) => toCommand(spec).apply(today);

describe('editing an existing element', () => {
  it('drops the flag when a path vertex moves, so the edited path is checked', () => {
    const doc = applied(movePathVertex('p1', 1, { x: 10, y: 0 }, { x: 10, y: 4 }));
    expect(doc.paths[0]?.existing).toBeUndefined();
  });

  it('drops the flag when a path vertex is inserted', () => {
    expect(applied(insertPathVertex('p1', 1, { x: 5, y: 1 })).paths[0]?.existing).toBeUndefined();
  });

  it('drops the flag when an area corner moves or the area is resized', () => {
    const corner = today.areas[0]?.polygon[0] ?? { x: 0, y: 0 };
    const moved = applied(moveAreaVertex('a1', 0, corner, { x: corner.x - 2, y: corner.y }));
    expect(moved.areas[0]?.existing).toBeUndefined();
    const resized = applied(resizeArea('a1', square(30, 30, 10), square(30, 30, 12)));
    expect(resized.areas[0]?.existing).toBeUndefined();
  });
});
