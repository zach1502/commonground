import { describe, expect, it } from 'vitest';

import {
  addArea,
  addItem,
  addPath,
  batch,
  deleteArea,
  deleteItem,
  deletePath,
  duplicateItem,
  insertPathVertex,
  moveAreaVertex,
  moveItem,
  movePathVertex,
  resizeArea,
  rotateItem,
  terraform,
  toCommand,
} from './commands.js';
import { docOf, itemId, square, treeInput } from './test-fixtures.js';

const base = docOf({
  items: [treeInput('t1', 10, 10), treeInput('t2', 20, 20)],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  ],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: square(30, 30, 10), locked: false }],
});
const tree = docOf({ items: [treeInput('t3', 5, 5)] }).items[0];
const path = base.paths[0];
const area = base.areas[0];

function roundTrip(spec: Parameters<typeof toCommand>[0]) {
  const command = toCommand(spec);
  const applied = command.apply(base);
  return { applied, reverted: command.revert(applied) };
}

describe('item commands', () => {
  it('adds an item and removes it again', () => {
    if (tree === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(addItem(tree));
    expect(applied.items.map((item) => item.id)).toEqual(['t1', 't2', 't3']);
    expect(reverted).toEqual(base);
  });

  it('moves an item and moves it back', () => {
    const { applied, reverted } = roundTrip(moveItem('t1', { x: 10, y: 10 }, { x: 12.5, y: 9 }));
    expect(applied.items[0]?.position).toEqual({ x: 12.5, y: 9 });
    expect(reverted).toEqual(base);
  });

  it('rotates an item and turns it back', () => {
    const { applied, reverted } = roundTrip(rotateItem('t2', 0, 45));
    expect(applied.items[1]?.rotationDeg).toBe(45);
    expect(reverted).toEqual(base);
  });

  it('deletes an item and restores it at the same place in the list', () => {
    const first = base.items[0];
    if (first === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(deleteItem(first, 0));
    expect(applied.items.map((item) => item.id)).toEqual(['t2']);
    expect(reverted.items.map((item) => item.id)).toEqual(['t1', 't2']);
  });

  it('duplicates an item under a new id with an offset', () => {
    const first = base.items[0];
    if (first === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(duplicateItem(first, 't9', { x: 1, y: 1 }));
    expect(applied.items[2]).toMatchObject({ id: 't9', position: { x: 11, y: 11 } });
    expect(reverted).toEqual(base);
  });

  it('leaves the document alone when the id is unknown', () => {
    const command = toCommand(moveItem('nope', { x: 0, y: 0 }, { x: 1, y: 1 }));
    expect(command.apply(base)).toEqual(base);
  });
});

describe('path commands', () => {
  it('adds a path and removes it', () => {
    if (path === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(addPath({ ...path, id: itemId('p2') }));
    expect(applied.paths.map((entry) => entry.id)).toEqual(['p1', 'p2']);
    expect(reverted).toEqual(base);
  });

  it('moves a vertex and moves it back', () => {
    const { applied, reverted } = roundTrip(
      movePathVertex('p1', 1, { x: 10, y: 0 }, { x: 10, y: 4 }),
    );
    expect(applied.paths[0]?.points[1]).toEqual({ x: 10, y: 4 });
    expect(reverted).toEqual(base);
  });

  it('inserts a vertex and removes it', () => {
    const { applied, reverted } = roundTrip(insertPathVertex('p1', 1, { x: 5, y: 1 }));
    expect(applied.paths[0]?.points).toHaveLength(3);
    expect(applied.paths[0]?.points[1]).toEqual({ x: 5, y: 1 });
    expect(reverted).toEqual(base);
  });

  it('deletes a path and restores it', () => {
    if (path === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(deletePath(path, 0));
    expect(applied.paths).toHaveLength(0);
    expect(reverted).toEqual(base);
  });
});

describe('area commands', () => {
  it('adds an area and removes it', () => {
    if (area === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(addArea({ ...area, id: itemId('a2') }));
    expect(applied.areas).toHaveLength(2);
    expect(reverted).toEqual(base);
  });

  it('moves a corner and moves it back', () => {
    const { applied, reverted } = roundTrip(
      moveAreaVertex('a1', 2, { x: 40, y: 40 }, { x: 42, y: 41 }),
    );
    expect(applied.areas[0]?.polygon[2]).toEqual({ x: 42, y: 41 });
    expect(reverted).toEqual(base);
  });

  it('resizes an area to a new outline and back', () => {
    if (area === undefined) throw new Error('fixture');
    const bigger = docOf({
      areas: [{ ...area, polygon: square(30, 30, 20) }],
    }).areas[0]?.polygon;
    if (bigger === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(resizeArea('a1', area.polygon, bigger));
    expect(applied.areas[0]?.polygon).toEqual(bigger);
    expect(reverted).toEqual(base);
  });

  it('deletes an area and restores it', () => {
    if (area === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(deleteArea(area, 0));
    expect(applied.areas).toHaveLength(0);
    expect(reverted).toEqual(base);
  });
});

describe('batch', () => {
  it('applies every command in order and reverts them in reverse order', () => {
    const { applied, reverted } = roundTrip(
      batch([
        moveItem('t1', { x: 10, y: 10 }, { x: 11, y: 10 }),
        moveItem('t2', { x: 20, y: 20 }, { x: 21, y: 20 }),
        rotateItem('t2', 0, 15),
      ]),
    );
    expect(applied.items.map((item) => item.position.x)).toEqual([11, 21]);
    expect(applied.items[1]?.rotationDeg).toBe(15);
    expect(reverted).toEqual(base);
  });

  it('reverts a delete of two items back to the original order', () => {
    const [first, second] = base.items;
    if (first === undefined || second === undefined) throw new Error('fixture');
    const { applied, reverted } = roundTrip(batch([deleteItem(first, 0), deleteItem(second, 0)]));
    expect(applied.items).toHaveLength(0);
    expect(reverted).toEqual(base);
  });
});

describe('terraform command', () => {
  it('merges a patch into the grade delta and reverts it exactly', () => {
    const command = toCommand(
      terraform([
        { x: 1, y: 1, deltaM: 2 },
        { x: 2, y: 1, deltaM: -1 },
      ]),
    );
    const applied = command.apply(base);
    expect(applied.gradeDelta.cells).toEqual([
      { x: 1, y: 1, deltaM: 2 },
      { x: 2, y: 1, deltaM: -1 },
    ]);
    expect(command.revert(applied).gradeDelta.cells).toEqual([]);
  });

  it('coalesces with an existing delta at the same cell', () => {
    const first = toCommand(terraform([{ x: 3, y: 3, deltaM: 1 }])).apply(base);
    const second = toCommand(terraform([{ x: 3, y: 3, deltaM: 2 }])).apply(first);
    expect(second.gradeDelta.cells).toEqual([{ x: 3, y: 3, deltaM: 3 }]);
  });
});
